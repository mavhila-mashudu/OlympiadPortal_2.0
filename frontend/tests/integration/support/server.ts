import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const API_URL = "http://api.test";

// Requests every signed-in page makes in the background: the shell polls for
// portal notifications, and dashboards load the invitation inbox. They answer
// "nothing yet" by default so each test only describes the endpoints its page
// is about; a test that cares overrides them with server.use() as usual.
// server.resetHandlers() restores these after every test.
const backgroundDefaults = [
  http.get(`${API_URL}/notifications`, () =>
    HttpResponse.json({ success: true, data: { notifications: [] } }),
  ),
  http.get(`${API_URL}/invites/mine`, () =>
    HttpResponse.json({ success: true, data: { invites: [] } }),
  ),
];

// Shared MSW server. Tests register the endpoints they need with server.use().
export const server = setupServer(...backgroundDefaults);
