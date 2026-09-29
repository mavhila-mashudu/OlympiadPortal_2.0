import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import App from "../../../src/App";
import { preloadAllPages } from "../../../src/lib/lazyPage";
import { clearCurrentOlympiadCache } from "../../../src/lib/olympiad";

// Pages are lazy-loaded chunks; fetch them all now so a page renders on the
// first pass, as the tests expect, instead of behind the Suspense fallback.
await preloadAllPages();

// A test helper, never hot-reloaded, so mixing it with renderApp is fine
// oxlint-disable-next-line react/only-export-components
function CurrentPath() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="current-path" hidden>
        {location.pathname}
        {location.search}
      </output>
      {/* Stands in for the browser's Back button */}
      <button type="button" hidden data-testid="history-back" onClick={() => navigate(-1)} />
    </>
  );
}

// Renders the real application routes starting at `path`, the same way
// main.tsx does (minus the browser history), with a fresh query cache.
export function renderApp(path: string) {
  // A fresh page load starts with nothing cached
  clearCurrentOlympiadCache();
  // A signed-in test user has the role of the page being opened, unless the
  // test chose one (signed-in pages check both token and role)
  const area = path.split(/[/?]/)[1];
  if (localStorage.getItem("op_access_token") && !localStorage.getItem("op_role") && ["organiser", "educator", "student"].includes(area)) {
    localStorage.setItem("op_role", area);
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <CurrentPath />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const currentPath = () => screen.getByTestId("current-path").textContent;
  const goBack = () => fireEvent.click(screen.getByTestId("history-back"));
  return { user, queryClient, currentPath, goBack, ...view };
}
