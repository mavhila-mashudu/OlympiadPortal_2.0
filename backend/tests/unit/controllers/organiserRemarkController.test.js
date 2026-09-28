// @ts-nocheck
jest.mock("../../../src/services/organiserRemarkService", () => ({
  listRemarks: jest.fn(),
  listEligibleEducators: jest.fn(),
  assignRemark: jest.fn(),
  autoAssignRemarks: jest.fn(),
}));

const organiserRemarkService = require("../../../src/services/organiserRemarkService");
const controller = require("../../../src/controllers/organiserRemarkController");
const { mockReq } = require("../helpers/http");
const { describeControllerCases } = require("../helpers/controllerCases");

const organiser = { userId: "org-1", role: "organiser" };
const ok = (data) => ({ success: true, data });

describe("organiserRemarkController", () => {
  describeControllerCases(controller, [
    {
      handler: "listRemarks",
      service: organiserRemarkService,
      method: "listRemarks",
      req: mockReq({
        user: organiser,
        query: { olympiadId: "oly-1", roundId: "round-1", status: "unassigned" },
      }),
      args: ["org-1", { olympiadId: "oly-1", roundId: "round-1", status: "unassigned" }],
      json: (remarks) => ok({ remarks }),
    },
    {
      handler: "listEligibleEducators",
      service: organiserRemarkService,
      method: "listEligibleEducators",
      req: mockReq({
        user: organiser,
        params: { roundId: "round-1" },
      }),
      args: ["org-1", "round-1"],
      json: (educators) => ok({ educators }),
    },
    {
      handler: "assignRemark",
      service: organiserRemarkService,
      method: "assignRemark",
      req: mockReq({
        user: organiser,
        params: { remarkId: "rem-1" },
        body: { reviewerId: "user-edu-1" },
      }),
      args: ["org-1", "rem-1", "user-edu-1"],
      json: (remark) => ok({ remark }),
    },
    {
      handler: "autoAssignRemarks",
      service: organiserRemarkService,
      method: "autoAssignRemarks",
      req: mockReq({
        user: organiser,
        params: { roundId: "round-1" },
      }),
      args: ["org-1", "round-1"],
      json: (result) => ok(result),
    },
  ]);
});
