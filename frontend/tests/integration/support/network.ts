// Helpers for describing the backend and Supabase to MSW.
//
// Responses use the backend's real envelope ({ success, data } /
// { success: false, error }) and the shapes its services actually return, so
// pages are tested against what they will really receive.
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

const readBody = async (request: Request): Promise<unknown> => {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) return request.formData();
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
