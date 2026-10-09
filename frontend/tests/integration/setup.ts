import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { File as NodeFile } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { API_URL, SUPABASE_URL } from './support/network';
import { server } from './support/server';

// Waiting for a page to finish loading has one second by default, which a
// busy CI runner can exceed even when nothing is wrong. The wait ends as soon
// as the element appears, so a longer limit only affects genuine failures.
configure({ asyncUtilTimeout: 5000 });

// Point the app at hosts MSW handles. Stubbed at load time (api.ts reads
// VITE_API_URL when imported) and again before each test (unstubEnvs resets
// them), so a developer's frontend/.env can never send tests to real servers.
const stubTestEnv = () => {
    vi.stubEnv('VITE_API_URL', API_URL);
    vi.stubEnv('VITE_SUPABASE_URL', SUPABASE_URL);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-test-key');
};
stubTestEnv();

// jsdom builds FormData from a <form> with empty (0-byte) entries for file
// inputs, where browsers keep the chosen files. Re-add the real files so
// upload code (e.g. CreateRound's `paperFile.size > 0`) behaves as in a browser.
const JsdomFormData = globalThis.FormData;
class BrowserLikeFormData extends JsdomFormData {
    constructor(form?: HTMLFormElement, submitter?: HTMLElement | null) {
        super(form, submitter);
        if (!form) return;
        for (const el of Array.from(form.elements)) {
            if (
                el instanceof HTMLInputElement &&
                el.type === 'file' &&
                el.name &&
                !el.disabled
            ) {
                this.delete(el.name);
                for (const file of Array.from(el.files ?? []))
                    this.append(el.name, file);
            }
        }
    }
}
const installBrowserLikeFormData = () =>
    vi.stubGlobal('FormData', BrowserLikeFormData);
installBrowserLikeFormData();

// fetch comes from Node, which can't serialise jsdom's FormData/File (a file
// arrives as the text "undefined"). Rebuild such bodies from Node's own
// FormData and File, as a browser would send them, before MSW sees the request.
const NativeFormData = (await new Response(new URLSearchParams()).formData())
    .constructor as typeof FormData;
const toNativeFormData = async (form: FormData) => {
    const native = new NativeFormData();
    for (const [name, value] of form.entries()) {
        if (typeof value === 'string') native.append(name, value);
        else
            native.append(
                name,
                new NodeFile(
                    [new Uint8Array(await value.arrayBuffer())],
                    value.name,
                    {
                        type: value.type,
                    }
                ) as unknown as Blob
            );
    }
    return native;
};

let mswFetch: typeof fetch;
beforeAll(() => {
    // Any request without a handler fails the test instead of leaking out
    server.listen({ onUnhandledRequest: 'error' });
    mswFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) =>
        init?.body instanceof JsdomFormData
            ? mswFetch(input, {
                  ...init,
                  body: await toNativeFormData(init.body),
              })
            : mswFetch(input, init);
});

beforeEach(() => {
    stubTestEnv();
    installBrowserLikeFormData();
    // Pages assume a signed-in user; tests for signed-out flows clear this
    localStorage.setItem('op_access_token', 'test-token');
});

afterEach(() => {
    cleanup();
    server.resetHandlers();
    localStorage.clear();
});

afterAll(() => {
    globalThis.fetch = mswFetch;
    server.close();
});
