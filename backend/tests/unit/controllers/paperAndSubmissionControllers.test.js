jest.mock("../../../src/services/paperService", () => ({
  uploadRoundPapers: jest.fn(),
  getDownloadUrl: jest.fn(),
  getRoundViewUrl: jest.fn(),
}));
jest.mock("../../../src/services/submissionService", () => ({
  createSubmission: jest.fn(),
  listSubmissions: jest.fn(),
  getSubmission: jest.fn(),
}));
jest.mock("../../../src/services/studentRoundService", () => ({
  getRegisteredRounds: jest.fn(),
  getStudentRoundDetail: jest.fn(),
  getStudentResults: jest.fn(),
  getStudentPaperUrl: jest.fn(),
}));

const paperService = require("../../../src/services/paperService");
const submissionService = require("../../../src/services/submissionService");
const studentRoundService = require("../../../src/services/studentRoundService");
const paperController = require("../../../src/controllers/paperController");
const submissionController = require("../../../src/controllers/submissionController");
const studentRoundController = require("../../../src/controllers/studentRoundController");
const { mockReq, run } = require("../helpers/http");
const { describeControllerCases } = require("../helpers/controllerCases");

const organiser = { userId: "org-1", role: "organiser" };
const ok = (data) => ({ success: true, data });

describe("paperController", () => {
  const paperFile = { originalname: "paper.pdf" };
  const memoFile = { originalname: "memo.pdf" };

  describeControllerCases(paperController, [
    {
      handler: "uploadPapers",
      service: paperService,
      method: "uploadRoundPapers",
      req: mockReq({ user: organiser, params: { id: "round-1" }, files: { paper: [paperFile], memo: [memoFile] } }),
      args: [{ roundId: "round-1", organiserId: "org-1", paperFile, memoFile }],
      status: 201,
      json: (result) => ok({ paper: result }),
    },
    {
      handler: "downloadPaper",
      service: paperService,
      method: "getDownloadUrl",
      req: mockReq({ user: organiser, params: { id: "paper-1" }, query: { type: "memo" } }),
      args: ["paper-1", "org-1", "memo"],
      json: (result) => ok({ url: result }),
    },
    {
      handler: "getRoundPaperUrl",
      service: paperService,
      method: "getRoundViewUrl",
      req: mockReq({ user: { userId: "edu-1", role: "educator" }, params: { roundId: "round-1" } }),
      args: ["round-1", "edu-1", "educator", "paper"],
      json: (result) => ok({ url: result }),
    },
  ]);

  it("uploads with no files attached, leaving validation to the service", async () => {
    paperService.uploadRoundPapers.mockReset().mockResolvedValue({});
    await run(paperController.uploadPapers, mockReq({ user: organiser, params: { id: "round-1" } }));
    expect(paperService.uploadRoundPapers).toHaveBeenCalledWith({
      roundId: "round-1",
      organiserId: "org-1",
      paperFile: undefined,
      memoFile: undefined,
    });
  });

  it.each([
    ["downloadPaper", "getDownloadUrl", { id: "paper-1" }],
    ["getRoundPaperUrl", "getRoundViewUrl", { roundId: "round-1" }],
  ])("%s only accepts 'memo' or 'paper' as the file type", async (handler, method, params) => {
    paperService[method].mockReset().mockResolvedValue("url");
    await run(paperController[handler], mockReq({ user: organiser, params, query: { type: "../../etc/passwd" } }));
    expect(paperService[method].mock.calls[0]).toContain("paper");
  });
});

describe("submissionController", () => {
  const answers = [{ question_id: "q-1", answer_value: "0" }];

  describeControllerCases(submissionController, [
    {
      handler: "createSubmission",
      service: submissionService,
      method: "createSubmission",
      req: mockReq({
        user: { userId: "edu-1", role: "educator" },
        params: { roundId: "round-1" },
        body: { entrant_id: "ent-1", route: "offline", answers, status: "marked" },
      }),
      args: ["round-1", "edu-1", { entrant_id: "ent-1", route: "offline", answers }],
      status: 201,
      result: { submission: { id: "sub-1" }, answers: [{ id: "a-1" }], totalPoints: 3, allAutoMarked: false },
      json: () => ok({ submission: { id: "sub-1" }, answers: [{ id: "a-1" }], totalPoints: 3, autoMarked: false }),
    },
    {
      handler: "listSubmissions",
      service: submissionService,
      method: "listSubmissions",
      req: mockReq({ user: organiser, params: { roundId: "round-1" } }),
      args: ["round-1", "org-1", "organiser"],
      json: (result) => ok({ submissions: result }),
    },
    {
      handler: "getSubmission",
      service: submissionService,
      method: "getSubmission",
      req: mockReq({ user: organiser, params: { roundId: "round-1", id: "sub-1" } }),
      args: ["sub-1", "org-1", "organiser", "round-1"],
      json: (result) => ok({ submission: result }),
    },
  ]);

  it("renames allAutoMarked to autoMarked in the response", async () => {
    submissionService.createSubmission.mockReset().mockResolvedValue({
      submission: { id: "sub-1" },
      answers: [],
      totalPoints: 4,
      allAutoMarked: true,
    });
    const { res } = await run(
      submissionController.createSubmission,
      mockReq({ user: organiser, params: { roundId: "round-1" }, body: {} }),
    );
    expect(res.json).toHaveBeenCalledWith(
      ok({ submission: { id: "sub-1" }, answers: [], totalPoints: 4, autoMarked: true }),
    );
  });
});

describe("studentRoundController", () => {
  const student = { userId: "stu-1", role: "student", entrant: { id: "ent-1" } };

  describeControllerCases(studentRoundController, [
    {
      handler: "listRegisteredRounds",
      service: studentRoundService,
      method: "getRegisteredRounds",
      req: mockReq({ user: student }),
      args: ["ent-1"],
      json: (result) => ok(result),
    },
    {
      handler: "getRoundDetail",
      service: studentRoundService,
      method: "getStudentRoundDetail",
      req: mockReq({ user: student, params: { roundId: "round-1" } }),
      args: ["round-1", "ent-1"],
      json: (result) => ok({ round: result }),
    },
    {
      handler: "getStudentResults",
      service: studentRoundService,
      method: "getStudentResults",
      req: mockReq({ user: student }),
      args: ["ent-1"],
      json: (result) => ok(result),
    },
    {
      handler: "downloadPaper",
      service: studentRoundService,
      method: "getStudentPaperUrl",
      req: mockReq({ user: student, params: { roundId: "round-1" } }),
      args: ["round-1", "ent-1"],
      result: "https://signed.test/paper",
      json: (url) => ok({ url }),
    },
  ]);

  describe.each([
    ["listRegisteredRounds", "getRegisteredRounds"],
    ["getRoundDetail", "getStudentRoundDetail"],
    ["getStudentResults", "getStudentResults"],
    ["downloadPaper", "getStudentPaperUrl"],
  ])("%s without a linked entrant", (handler, method) => {
    it.each([
      ["a user with no entrant", { userId: "u", role: "student", entrant: null }],
      ["no user at all", undefined],
    ])("responds 403 for %s", async (_label, user) => {
      studentRoundService[method].mockReset();
      const { next } = await run(studentRoundController[handler], mockReq({ user, params: { roundId: "r" } }));
      expect(next.mock.calls[0][0]).toMatchObject({
        statusCode: 403,
        message: "No entrant profile linked to your account",
      });
      expect(studentRoundService[method]).not.toHaveBeenCalled();
    });
  });
});
