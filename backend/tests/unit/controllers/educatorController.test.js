jest.mock("../../../src/services/educatorService", () => ({
  listEducatorRounds: jest.fn(),
  getEducatorRoundDetail: jest.fn(),
  registerEntrants: jest.fn(),
  registerEntrantsForOlympiad: jest.fn(),
  listEntrants: jest.fn(),
  listOlympiadEntrants: jest.fn(),
  getProgressionInfo: jest.fn(),
  getOlympiadProgressionInfo: jest.fn(),
  getResults: jest.fn(),
  listAllResults: jest.fn(),
  listPastPapers: jest.fn(),
  getPaperDownloadUrl: jest.fn(),
}));

const educatorService = require("../../../src/services/educatorService");
const controller = require("../../../src/controllers/educatorController");
const { mockReq, run } = require("../helpers/http");
const { describeControllerCases } = require("../helpers/controllerCases");

const user = { userId: "edu-user", role: "educator" };
const ok = (data) => ({ success: true, data });
const roundReq = (extra = {}) => mockReq({ user, params: { roundId: "round-1" }, ...extra });
const olympiadReq = (extra = {}) => mockReq({ user, params: { olympiadId: "oly-1" }, ...extra });
const entrants = [{ full_name: "Ayanda", grade: "10" }];

describeControllerCases(controller, [
  {
    handler: "listRounds",
    service: educatorService,
    method: "listEducatorRounds",
    req: mockReq({ user }),
    args: ["edu-user"],
    result: { rounds: [{ id: "round-1" }], school: { id: "school-1", name: "Parktown" }, extra: "dropped" },
    json: () => ok({ rounds: [{ id: "round-1" }], school: { id: "school-1", name: "Parktown" } }),
  },
  {
    handler: "getRound",
    service: educatorService,
    method: "getEducatorRoundDetail",
    req: roundReq(),
    args: ["round-1", "edu-user"],
    json: (result) => ok({ round: result }),
  },
  {
    handler: "registerEntrants",
    service: educatorService,
    method: "registerEntrants",
    req: roundReq({ body: { entrants } }),
    args: ["round-1", "edu-user", entrants],
    status: 201,
    json: (result) => ok({ entrants: result }),
  },
  {
    handler: "listEntrants",
    service: educatorService,
    method: "listEntrants",
    req: roundReq(),
    args: ["round-1", "edu-user"],
    json: (result) => ok({ entrants: result }),
  },
  {
    handler: "getProgressionInfo",
    service: educatorService,
    method: "getProgressionInfo",
    req: roundReq(),
    args: ["round-1", "edu-user"],
    json: (result) => ok(result),
  },
  {
    handler: "registerEntrantsForOlympiad",
    service: educatorService,
    method: "registerEntrantsForOlympiad",
    req: olympiadReq({ body: { entrants } }),
    args: ["oly-1", "edu-user", entrants],
    status: 201,
    json: (result) => ok({ entrants: result }),
  },
  {
    handler: "listOlympiadEntrants",
    service: educatorService,
    method: "listOlympiadEntrants",
    req: olympiadReq(),
    args: ["oly-1", "edu-user"],
    json: (result) => ok({ entrants: result }),
  },
  {
    handler: "getOlympiadProgressionInfo",
    service: educatorService,
    method: "getOlympiadProgressionInfo",
    req: olympiadReq(),
    args: ["oly-1", "edu-user"],
    json: (result) => ok(result),
  },
  {
    handler: "getResults",
    service: educatorService,
    method: "getResults",
    req: roundReq(),
    args: ["round-1", "edu-user"],
    json: (result) => ok(result),
  },
  {
    handler: "listAllResults",
    service: educatorService,
    method: "listAllResults",
    req: mockReq({ user }),
    args: ["edu-user"],
    json: (result) => ok({ rounds: result }),
  },
  {
    handler: "listPastPapers",
    service: educatorService,
    method: "listPastPapers",
    req: roundReq(),
    args: ["round-1", "edu-user"],
    json: (result) => ok({ papers: result }),
  },
  {
    handler: "downloadPaper",
    service: educatorService,
    method: "getPaperDownloadUrl",
    req: roundReq({ query: { type: "memo" } }),
    args: ["round-1", "edu-user", "memo"],
    json: (result) => ok({ url: result }),
  },
]);

describe("downloadPaper type", () => {
  it.each([
    [{}, "paper"],
    [{ type: "paper" }, "paper"],
    [{ type: "answers.exe" }, "paper"],
  ])("treats query %p as %p", async (query, type) => {
    educatorService.getPaperDownloadUrl.mockReset().mockResolvedValue("url");
    await run(controller.downloadPaper, roundReq({ query }));
    expect(educatorService.getPaperDownloadUrl).toHaveBeenCalledWith("round-1", "edu-user", type);
  });
});
