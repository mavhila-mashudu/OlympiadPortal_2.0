// Loading spinners only appear once a load has taken longer than this, so
// quick responses never flash a spinner over the page.
export const LOADING_SHOW_DELAY_MS = 800;

let activeRequests = 0;
let visible = false;
let showTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function setVisible(next: boolean) {
  if (visible === next) return;
  visible = next;
  notify();
}

export function beginPageLoad() {
  activeRequests += 1;
  if (!visible && !showTimer) {
    showTimer = setTimeout(() => {
      showTimer = undefined;
      if (activeRequests > 0) setVisible(true);
    }, LOADING_SHOW_DELAY_MS);
  }
}

export function endPageLoad() {
  activeRequests = Math.max(0, activeRequests - 1);
  if (activeRequests > 0) return;
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = undefined;
  }
  setVisible(false);
}

export function subscribeToPageLoad(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isPageLoading() {
  return visible;
}
