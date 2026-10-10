import { lazy, type ComponentType } from 'react';

type PageModule = { default: ComponentType };

const preloaders: Array<() => Promise<PageModule>> = [];

// React.lazy with a preload hook. Once a page's chunk has arrived, React is
// handed a thenable that resolves synchronously, so the page renders straight
// away instead of flashing the Suspense fallback.
export function lazyPage(load: () => Promise<PageModule>) {
    let loaded: PageModule | undefined;
    let pending: Promise<PageModule> | undefined;
    const preload = () =>
        (pending ??= load().then((module) => (loaded = module)));
    preloaders.push(preload);

    return lazy(() => {
        if (!loaded) return preload();
        const module = loaded;
        return {
            then: (resolve: (value: PageModule) => void) => resolve(module),
        } as Promise<PageModule>;
    });
}

// Downloads every page chunk up front (used by the integration tests, which
// render pages synchronously).
export function preloadAllPages() {
    return Promise.all(preloaders.map((preload) => preload()));
}
