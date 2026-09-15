import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import App from "../../../src/App";

// A test helper, never hot-reloaded, so mixing it with renderApp is fine
// oxlint-disable-next-line react/only-export-components
function CurrentPath() {
  const location = useLocation();
  return (
    <output data-testid="current-path" hidden>
      {location.pathname}
      {location.search}
    </output>
  );
}

// Renders the real application routes starting at `path`, the same way
// main.tsx does (minus the browser history), with a fresh query cache.
export function renderApp(path: string) {
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
  return { user, queryClient, currentPath, ...view };
}
