const errorHandler = require("../../../src/middlewares/errorHandler");
const { NotFoundError, ValidationError } = require("../../../src/errors/AppError");
const { mockReq, mockRes } = require("../helpers/http");

const handle = (err) => {
  const res = mockRes();
  errorHandler(err, mockReq({ url: "/x", method: "GET" }), res, jest.fn());
  return res;
};

const expectResponse = (res, status, error) => {
  expect(res.status).toHaveBeenCalledWith(status);
  expect(res.json).toHaveBeenCalledWith({ success: false, error });
};

describe("errorHandler", () => {
  const originalEnv = process.env.NODE_ENV;
  let consoleError;

  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    consoleError.mockRestore();
  });

  it("returns an operational error's own status and message", () => {
    expectResponse(handle(new NotFoundError("Round not found")), 404, "Round not found");
  });

  it("returns 422 for validation errors", () => {
    expectResponse(handle(new ValidationError("Needs a number")), 422, "Needs a number");
  });

  it("maps a Prisma unique-constraint error (P2002) to 409", () => {
    expectResponse(handle({ code: "P2002", message: "raw" }), 409, "A record with that value already exists");
  });

  it("maps a Prisma record-not-found error (P2025) to 404", () => {
    expectResponse(handle({ code: "P2025", message: "raw" }), 404, "Record not found");
  });

  it("maps an invalid JWT to 401", () => {
    expectResponse(handle({ name: "JsonWebTokenError" }), 401, "Invalid token");
  });

  it("maps an expired JWT to 401", () => {
    expectResponse(handle({ name: "TokenExpiredError" }), 401, "Token expired");
  });

  it("hides unexpected error details in production", () => {
    process.env.NODE_ENV = "production";
    expectResponse(handle(new Error("SQL syntax near password")), 500, "Something went wrong");
  });

  it("shows unexpected error details outside production", () => {
    process.env.NODE_ENV = "development";
    expectResponse(handle(new Error("SQL syntax near password")), 500, "SQL syntax near password");
  });

  it("logs the stack trace only in development", () => {
    const err = new Error("boom");

    process.env.NODE_ENV = "development";
    handle(err);
    expect(consoleError).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: "boom", stack: err.stack, url: "/x", method: "GET" }),
    );

    process.env.NODE_ENV = "production";
    handle(err);
    expect(consoleError).toHaveBeenLastCalledWith(expect.objectContaining({ stack: undefined }));
  });
});
