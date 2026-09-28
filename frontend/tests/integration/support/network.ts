// Helpers for describing the backend and Supabase to MSW.
//
// Responses use the backend's real envelope ({ success, data } /
// { success: false, error }) and the shapes its services actually return, so
// pages are tested against what they will really receive.
import { File as NodeFile } from "node:buffer";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { server } from "./server";

export const API_URL = "http://api.test";
export const SUPABASE_URL = "http://supabase.test";

type Method = "get" | "post" | "patch" | "delete";

export type RecordedRequest = {
  method: string;
  path: string;
  search: string;
  body: unknown;
  headers: Headers;
};

// Node's fetch parses an uploaded form. From Node 24 its parser builds each
// file part with whatever `File` is global, then asserts the result is Node's
// own File. Under jsdom the global is jsdom's File, so that assertion fails
// and the request never resolves (Node 22 never looked at the global). So
// the parse runs with Node's File in place. The body is read first, so the
// swap covers only the parse itself.
const parseMultipart = async (request: Request): Promise<FormData> => {
  const bytes = await request.arrayBuffer();
  const parsing = new Response(bytes, { headers: { "content-type": request.headers.get("content-type") ?? "" } });
  const jsdomFile = globalThis.File;
  globalThis.File = NodeFile as unknown as typeof File;
  try {
    return await parsing.formData();
  } finally {
    globalThis.File = jsdomFile;
  }
};

const readBody = async (request: Request): Promise<unknown> => {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) return parseMultipart(request);
  // api.ts sends a JSON content type on every request, including GETs with
  // no body, so only parse when there is something to parse
  const text = await request.text();
  if (!text) return undefined;
  return type.includes("application/json") ? JSON.parse(text) : text;
};

// Registers an endpoint returning { success: true, data }. `data` may be a
// function of the request for dynamic responses. Returns the list of requests
// the endpoint received.
export function mockApi(
  method: Method,
  path: string,
  data: JsonBodyType | ((req: RecordedRequest) => JsonBodyType),
  { status = 200 }: { status?: number } = {},
) {
  const calls: RecordedRequest[] = [];
  server.use(
    http[method](`${API_URL}${path}`, async ({ request }) => {
      const url = new URL(request.url);
      const recorded: RecordedRequest = {
        method: request.method,
        path: url.pathname,
        search: url.search,
        body: await readBody(request),
        headers: request.headers,
      };
      calls.push(recorded);
      const payload = typeof data === "function" ? data(recorded) : data;
      return HttpResponse.json({ success: true, data: payload }, { status });
    }),
  );
  return calls;
}

// Registers an endpoint that fails the way the backend's error handler does
export function mockApiError(method: Method, path: string, status: number, error: string) {
  const calls: RecordedRequest[] = [];
  server.use(
    http[method](`${API_URL}${path}`, async ({ request }) => {
      calls.push({
        method: request.method,
        path: new URL(request.url).pathname,
        search: new URL(request.url).search,
        body: await readBody(request),
        headers: request.headers,
      });
      return HttpResponse.json({ success: false, error }, { status });
    }),
  );
  return calls;
}

// Registers an endpoint whose connection fails (fetch rejects with TypeError)
export function mockNetworkFailure(method: Method, path: string) {
  server.use(http[method](`${API_URL}${path}`, () => HttpResponse.error()));
}

// Supabase password sign-in (POST /auth/v1/token?grant_type=password)
export function mockSupabaseSignIn(
  outcome: { userId: string; accessToken?: string } | { error: string },
) {
  const calls: Array<{ email: string; password: string }> = [];
  server.use(
    http.post(`${SUPABASE_URL}/auth/v1/token`, async ({ request }) => {
      calls.push((await request.json()) as { email: string; password: string });
      if ("error" in outcome) {
        return HttpResponse.json(
          { code: "invalid_credentials", error_code: "invalid_credentials", msg: outcome.error, message: outcome.error },
          { status: 400 },
        );
      }
      const now = Math.floor(Date.now() / 1000);
      return HttpResponse.json({
        access_token: outcome.accessToken ?? "supabase-access-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: now + 3600,
        refresh_token: "supabase-refresh-token",
        user: {
          id: outcome.userId,
          aud: "authenticated",
          role: "authenticated",
          email: "user@olympiad.test",
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      });
    }),
  );
  return calls;
}

// Supabase sign-out (POST /auth/v1/logout?scope=...)
export function mockSupabaseSignOut() {
  const calls: string[] = [];
  server.use(
    http.post(`${SUPABASE_URL}/auth/v1/logout`, ({ request }) => {
      calls.push(new URL(request.url).search);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

// Supabase password reset: the emailed link (POST /auth/v1/recover), the
// one-time token it carries (POST /auth/v1/verify) and the change itself
// (PUT /auth/v1/user)
export function mockSupabasePasswordReset({
  token = "recovery-token",
  verifyError,
}: { token?: string; verifyError?: string } = {}) {
  const requests: Array<{ email: string; redirect_to: string }> = [];
  const verifications: Array<{ token_hash: string; type: string }> = [];
  const updates: Array<{ password: string }> = [];

  const user = {
    id: "organiser-user",
    aud: "authenticated",
    role: "authenticated",
    email: "thandi@olympiad.test",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };

  server.use(
    http.post(`${SUPABASE_URL}/auth/v1/recover`, async ({ request }) => {
      const body = (await request.json()) as { email: string };
      const redirect = new URL(request.url).searchParams.get("redirect_to") ?? "";
      requests.push({ email: body.email, redirect_to: redirect });
      return HttpResponse.json({});
    }),
    http.post(`${SUPABASE_URL}/auth/v1/verify`, async ({ request }) => {
      const body = (await request.json()) as { token_hash: string; type: string };
      verifications.push(body);
      if (verifyError || body.token_hash !== token) {
        const message = verifyError ?? "Email link is invalid or has expired";
        return HttpResponse.json({ code: 403, error_code: "otp_expired", msg: message, message }, { status: 403 });
      }
      return HttpResponse.json({
        access_token: "recovery-access-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "recovery-refresh-token",
        user,
      });
    }),
    // The recovery session is ended once the password is changed
    http.post(`${SUPABASE_URL}/auth/v1/logout`, () => new HttpResponse(null, { status: 204 })),
    http.put(`${SUPABASE_URL}/auth/v1/user`, async ({ request }) => {
      updates.push((await request.json()) as { password: string });
      return HttpResponse.json(user);
    }),
  );

  return { requests, verifications, updates };
}
