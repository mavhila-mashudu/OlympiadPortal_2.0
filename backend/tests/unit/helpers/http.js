// Minimal Express req/res/next doubles for calling controllers, middleware
// and route handlers directly — no HTTP server involved.

const mockReq = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: { userId: "user-1", role: "organiser" },
  ...overrides,
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

// Route files keep their handlers private and export only the router.
// Express exposes each route's middleware stack, and the final entry is
// the handler itself.
const getRouteHandler = (router, method, path) => {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} route`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
};

// Runs an Express-style handler and resolves once it has responded or
// called next, so async handlers can be awaited in tests.
const run = async (handler, req) => {
  const res = mockRes();
  const next = jest.fn();
  await handler(req, res, next);
  return { res, next };
};

module.exports = { mockReq, mockRes, getRouteHandler, run };
