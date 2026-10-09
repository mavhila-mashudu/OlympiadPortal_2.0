import { beforeEach, describe, expect, it, vi } from 'vitest';

// api.ts reads VITE_API_URL when it loads, so each test imports a fresh copy
const loadApi = async (apiUrl = 'https://api.test') => {
    vi.stubEnv('VITE_API_URL', apiUrl);
    vi.resetModules();
    return import('../../../src/lib/api');
};

const jsonResponse = (
    body: unknown,
    init: { ok?: boolean; status?: number } = {}
) => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn().mockResolvedValue(body),
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ success: true, data: { ok: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
});

const lastCall = () => {
    const [url, options] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return { url, options, headers: options.headers as Headers };
};

describe('an ended session', () => {
    it('is reported when the API answers 401 to a request that carried a token', async () => {
        const { api, setToken, setSessionEndedHandler } = await loadApi();
        const ended = vi.fn();
        setSessionEndedHandler(ended);
        fetchMock.mockResolvedValue(
            jsonResponse(
                { success: false, error: 'Invalid or expired token' },
                { ok: false, status: 401 }
            )
        );

        setToken('jwt-123');
        await expect(api.get('/olympiads')).rejects.toThrow(
            'Invalid or expired token'
        );
        expect(ended).toHaveBeenCalledTimes(1);
    });

    it("isn't reported for a request without a token, or for other errors", async () => {
        const { api, setToken, setSessionEndedHandler } = await loadApi();
        const ended = vi.fn();
        setSessionEndedHandler(ended);

        fetchMock.mockResolvedValue(
            jsonResponse(
                { success: false, error: 'No token provided' },
                { ok: false, status: 401 }
            )
        );
        await expect(api.get('/olympiads')).rejects.toThrow();

        setToken('jwt-123');
        fetchMock.mockResolvedValue(
            jsonResponse(
                { success: false, error: 'Insufficient permissions' },
                { ok: false, status: 403 }
            )
        );
        await expect(api.get('/olympiads')).rejects.toThrow();

        expect(ended).not.toHaveBeenCalled();
    });
});

describe('token storage', () => {
    it('saves, reads and clears the access token in localStorage', async () => {
        const { getToken, setToken, clearToken } = await loadApi();

        expect(getToken()).toBeNull();
        setToken('jwt-123');
        expect(localStorage.getItem('op_access_token')).toBe('jwt-123');
        expect(getToken()).toBe('jwt-123');
        clearToken();
        expect(getToken()).toBeNull();
    });
});

describe('api requests', () => {
    it('prefixes paths with VITE_API_URL', async () => {
        const { api } = await loadApi('https://olympiad-backend.test');
        await api.get('/health');
        expect(lastCall().url).toBe('https://olympiad-backend.test/health');
    });

    it('falls back to the local backend when VITE_API_URL is empty', async () => {
        const { api } = await loadApi('');
        await api.get('/health');
        expect(lastCall().url).toBe('http://localhost:3000/health');
    });

    it('unwraps the data from a successful response', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({ success: true, data: { rounds: [1, 2] } })
        );
        const { api } = await loadApi();
        await expect(api.get('/educator/rounds')).resolves.toEqual({
            rounds: [1, 2],
        });
    });

    it('sends JSON content type and no Authorization header when signed out', async () => {
        const { api } = await loadApi();
        await api.get('/auth/me');
        const { options, headers } = lastCall();
        expect(options.method).toBeUndefined();
        expect(headers.get('Content-Type')).toBe('application/json');
        expect(headers.has('Authorization')).toBe(false);
    });

    it('sends the stored token as a Bearer token', async () => {
        const { api, setToken } = await loadApi();
        setToken('jwt-abc');
        await api.get('/auth/me');
        expect(lastCall().headers.get('Authorization')).toBe('Bearer jwt-abc');
    });

    it('POSTs a JSON-encoded body', async () => {
        const { api } = await loadApi();
        await api.post('/olympiads', { name: 'Maths' });
        const { options } = lastCall();
        expect(options.method).toBe('POST');
        expect(options.body).toBe('{"name":"Maths"}');
    });

    it('POSTs without a body when none is given', async () => {
        const { api } = await loadApi();
        await api.post('/rounds/r1/exam/start');
        expect(lastCall().options.body).toBeUndefined();
    });

    it('sends FormData as-is and lets the browser set the multipart header', async () => {
        const { api } = await loadApi();
        const form = new FormData();
        form.append('paper', new Blob(['%PDF']), 'paper.pdf');

        await api.post('/rounds/r1/papers', form);

        const { options, headers } = lastCall();
        expect(options.body).toBe(form);
        expect(headers.has('Content-Type')).toBe(false);
    });

    it('PATCHes a JSON body', async () => {
        const { api } = await loadApi();
        await api.patch('/rounds/r1/exam-status', { status: 'ready' });
        expect(lastCall().options).toMatchObject({
            method: 'PATCH',
            body: '{"status":"ready"}',
        });
    });

    it('PATCHes without a body when none is given', async () => {
        const { api } = await loadApi();
        await api.patch('/rounds/r1');
        expect(lastCall().options.body).toBeUndefined();
    });

    it('DELETEs', async () => {
        const { api } = await loadApi();
        await api.delete('/rounds/r1/questions/q1');
        expect(lastCall()).toMatchObject({
            url: 'https://api.test/rounds/r1/questions/q1',
            options: { method: 'DELETE' },
        });
    });
});

describe('api errors', () => {
    it("throws the server's error message", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse(
                { success: false, error: 'Round not found' },
                { ok: false, status: 404 }
            )
        );
        const { api } = await loadApi();
        await expect(api.get('/rounds/x')).rejects.toThrow('Round not found');
    });

    it('throws when a 200 response reports success: false', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({ success: false, error: 'Invitation not found' })
        );
        const { api } = await loadApi();
        await expect(api.get('/invites/mine')).rejects.toThrow(
            'Invitation not found'
        );
    });

    it('falls back to the status code when there is no error message', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({ success: false }, { ok: false, status: 500 })
        );
        const { api } = await loadApi();
        await expect(api.get('/x')).rejects.toThrow('Request failed (500)');
    });

    it("falls back to the status code when the body isn't JSON", async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 502,
            json: vi.fn().mockRejectedValue(new SyntaxError('bad json')),
        });
        const { api } = await loadApi();
        await expect(api.get('/x')).rejects.toThrow('Request failed (502)');
    });

    it('treats an empty successful body as a failure', async () => {
        fetchMock.mockResolvedValue(jsonResponse(null));
        const { api } = await loadApi();
        await expect(api.get('/x')).rejects.toThrow('Request failed (200)');
    });

    it("lets a network failure propagate as 'Failed to fetch'", async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
        const { api } = await loadApi();
        await expect(api.get('/x')).rejects.toThrow('Failed to fetch');
    });
});
