import { setupServer } from "msw/node";

// Shared MSW server. Tests register the endpoints they need with server.use().
export const server = setupServer();
