import { beginPageLoad, endPageLoad } from './loadingStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const TOKEN_KEY = 'op_access_token';

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

export const TOKEN_STORAGE_KEY = TOKEN_KEY;

// Told when the API answers 401 to a request that carried a token: the
// session has expired, been revoked, or its account was deleted. The page
// guard registers it while a signed-in page is open, and signs the user out.
let sessionEndedHandler: (() => void) | null = null;

export function setSessionEndedHandler(handler: (() => void) | null) {
    sessionEndedHandler = handler;
}

type ApiEnvelope<T> =
    { success: true; data: T } | { success: false; error: string };

// background: true marks a refresh the user didn't ask for (polling, health
// pings) — it must never cover the page with the loading overlay.
type GetOptions = { background?: boolean };

async function request<T>(
    path: string,
    options: RequestInit = {},
    { background = false }: GetOptions = {}
): Promise<T> {
    const token = getToken();
    const headers = new Headers(options.headers);

    // Don't set Content-Type for FormData — the browser needs to add
    // its own multipart boundary.
    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const isInitialDataRequest =
        !background &&
        (!options.method || options.method === 'GET') &&
        !path.startsWith('/notifications');
    if (isInitialDataRequest) beginPageLoad();
    try {
        const res = await fetch(`${API_URL}${path}`, { ...options, headers });

        let json: ApiEnvelope<T> | null = null;
        try {
            json = await res.json();
        } catch {
            // no body (e.g. some error responses) — fall through to the status check below
        }

        if (!res.ok || !json || json.success === false) {
            const message =
                json && 'error' in json && json.error
                    ? json.error
                    : `Request failed (${res.status})`;
            if (res.status === 401 && token) sessionEndedHandler?.();
            throw new Error(message);
        }

        return json.data;
    } finally {
        if (isInitialDataRequest) endPageLoad();
    }
}

export const api = {
    get: <T>(path: string, options?: GetOptions) =>
        request<T>(path, {}, options),
    post: <T>(path: string, body?: unknown) =>
        request<T>(path, {
            method: 'POST',
            body:
                body instanceof FormData
                    ? body
                    : body !== undefined
                      ? JSON.stringify(body)
                      : undefined,
        }),
    patch: <T>(path: string, body?: unknown) =>
        request<T>(path, {
            method: 'PATCH',
            body: body !== undefined ? JSON.stringify(body) : undefined,
        }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
export async function downloadCertificate(roundId: string) {
    const token = getToken();
    const response = await fetch(`${API_URL}/rounds/${roundId}/certificate`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
    });
    if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.error || 'Could not download certificate');
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `olympiad-certificate-${roundId}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
