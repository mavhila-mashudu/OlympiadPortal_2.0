const { run } = require("./http");

// Controllers are thin: pull values off the request, call one service
// function, wrap the result in the { success, data } envelope. Each case
// checks that mapping (argument names/order, status code, response shape)
// plus that a service failure reaches the error handler.
//
// case: {
//   handler: "createRound",            // controller export
//   service: roundService,             // mocked service module
//   method: "createRound",             // service function called
//   req: mockReq({...}),
//   args: [...],                       // expected service arguments
//   status: 201,                       // omit for the default 200
//   json: (result) => ({ ... }),       // expected body given the service result
//   result: { ... },                   // optional service return value
// }
const describeControllerCases = (controller, cases) => {
  describe.each(cases)("$handler", ({ handler, service, method, req, args, status, json, result = { from: method } }) => {

    beforeEach(() => service[method].mockReset());

    it(`calls ${method} with the request's values and responds`, async () => {
      service[method].mockResolvedValue(result);

      const { res, next } = await run(controller[handler], req);

      expect(service[method]).toHaveBeenCalledWith(...args);
      if (status) expect(res.status).toHaveBeenCalledWith(status);
      else expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(json(result));
      expect(next).not.toHaveBeenCalled();
    });

    it("passes a service error to the error handler", async () => {
      const err = new Error("service failed");
      service[method].mockRejectedValue(err);

      const { res, next } = await run(controller[handler], req);

      expect(next).toHaveBeenCalledWith(err);
      expect(res.json).not.toHaveBeenCalled();
    });
  });
};

module.exports = { describeControllerCases };
