// Organiser-facing controllers: olympiads, rounds, questions, marking,
// notification rules and schools/archive.
jest.mock("../../../src/services/olympiadService", () => ({
  createOlympiad: jest.fn(),
  listOlympiads: jest.fn(),
  getOlympiad: jest.fn(),
}));
jest.mock("../../../src/services/roundService", () => ({
  createRound: jest.fn(),
  listRounds: jest.fn(),
  getRound: jest.fn(),
  updateRound: jest.fn(),
  deleteRound: jest.fn(),
  setRoundState: jest.fn(),
}));
jest.mock("../../../src/services/questionService", () => ({
  createQuestion: jest.fn(),
  listQuestions: jest.fn(),
  updateQuestion: jest.fn(),
  deleteQuestion: jest.fn(),
}));
jest.mock("../../../src/services/markingService", () => ({
  autoMarkRound: jest.fn(),
  markAnswer: jest.fn(),
  generateResults: jest.fn(),
  getMarkingQueue: jest.fn(),
}));
jest.mock("../../../src/services/notificationRuleService", () => ({
  listRules: jest.fn(),
  createRule: jest.fn(),
  updateRule: jest.fn(),
  deleteRule: jest.fn(),
}));
jest.mock("../../../src/services/schoolService", () => ({ listSchools: jest.fn() }));
jest.mock("../../../src/services/paperService", () => ({ listArchive: jest.fn() }));

const olympiadService = require("../../../src/services/olympiadService");
const roundService = require("../../../src/services/roundService");
const questionService = require("../../../src/services/questionService");
const markingService = require("../../../src/services/markingService");
const notificationRuleService = require("../../../src/services/notificationRuleService");
const schoolService = require("../../../src/services/schoolService");
const paperService = require("../../../src/services/paperService");
const { mockReq } = require("../helpers/http");
const { describeControllerCases } = require("../helpers/controllerCases");

const organiser = { userId: "org-1", role: "organiser" };
const ok = (data) => ({ success: true, data });

describe("olympiadController", () => {
  describeControllerCases(require("../../../src/controllers/olympiadController"), [
    {
      handler: "createOlympiad",
      service: olympiadService,
      method: "createOlympiad",
      req: mockReq({ user: organiser, body: { name: "Maths", timezone: "Africa/Johannesburg", organiser_id: "hacker" } }),
      args: [{ name: "Maths", timezone: "Africa/Johannesburg", organiserId: "org-1" }],
      status: 201,
      json: (result) => ok({ olympiad: result }),
    },
    {
      handler: "listOlympiads",
      service: olympiadService,
      method: "listOlympiads",
      req: mockReq({ user: organiser }),
      args: ["org-1"],
      json: (result) => ok({ olympiads: result }),
    },
    {
      handler: "getOlympiad",
      service: olympiadService,
      method: "getOlympiad",
      req: mockReq({ user: organiser, params: { id: "oly-1" } }),
      args: ["oly-1", "org-1"],
      json: (result) => ok({ olympiad: result }),
    },
  ]);
});

describe("roundController", () => {
  const schedule = {
    name: "Round 1",
    notes: "Bring pencils",
    opens_at: "2026-06-01T08:00:00Z",
    closes_at: "2026-06-01T10:00:00Z",
    qualifying_threshold: 50,
  };

  describeControllerCases(require("../../../src/controllers/roundController"), [
    {
      handler: "createRound",
      service: roundService,
      method: "createRound",
      req: mockReq({ user: organiser, params: { olympiadId: "oly-1" }, body: schedule }),
      args: [
        {
          olympiadId: "oly-1",
          organiserId: "org-1",
          name: "Round 1",
          notes: "Bring pencils",
          opensAt: "2026-06-01T08:00:00Z",
          closesAt: "2026-06-01T10:00:00Z",
          qualifyingThreshold: 50,
        },
      ],
      status: 201,
      json: (result) => ok({ round: result }),
    },
    {
      handler: "listRounds",
      service: roundService,
      method: "listRounds",
      req: mockReq({ user: organiser, params: { olympiadId: "oly-1" } }),
      args: ["oly-1", "org-1"],
      json: (result) => ok({ rounds: result }),
    },
    {
      handler: "getRound",
      service: roundService,
      method: "getRound",
      req: mockReq({ user: organiser, params: { id: "round-1" } }),
      args: ["round-1", "org-1"],
      json: (result) => ok({ round: result }),
    },
    {
      handler: "updateRound",
      service: roundService,
      method: "updateRound",
      req: mockReq({ user: organiser, params: { id: "round-1" }, body: schedule }),
      args: [
        "round-1",
        "org-1",
        {
          name: "Round 1",
          opensAt: "2026-06-01T08:00:00Z",
          closesAt: "2026-06-01T10:00:00Z",
          qualifyingThreshold: 50,
        },
      ],
      json: (result) => ok({ round: result }),
    },
    {
      handler: "deleteRound",
      service: roundService,
      method: "deleteRound",
      req: mockReq({ user: organiser, params: { id: "round-1" } }),
      args: ["round-1", "org-1"],
      json: () => ok({ message: "Round deleted" }),
    },
    {
      handler: "setRoundState",
      service: roundService,
      method: "setRoundState",
      req: mockReq({ user: organiser, params: { id: "round-1" }, body: { state: "open" } }),
      args: ["round-1", "org-1", "open"],
      json: (result) => ok({ round: result }),
    },
  ]);
});

describe("questionController", () => {
  const fields = {
    type: "mcq",
    prompt: "2 + 2?",
    options: ["3", "4"],
    correct_option: "1",
    correct_answer: undefined,
    negative_pct: 10,
    max_points: 2,
  };
  const educator = { userId: "edu-1", role: "educator" };

  describeControllerCases(require("../../../src/controllers/questionController"), [
    {
      handler: "createQuestion",
      service: questionService,
      method: "createQuestion",
      req: mockReq({ user: educator, params: { roundId: "round-1" }, body: { ...fields, paper_id: "sneaky" } }),
      args: ["round-1", "edu-1", "educator", fields],
      status: 201,
      json: (result) => ok({ question: result }),
    },
    {
      handler: "listQuestions",
      service: questionService,
      method: "listQuestions",
      req: mockReq({ user: educator, params: { roundId: "round-1" } }),
      args: ["round-1", "edu-1", "educator"],
      json: (result) => ok({ questions: result }),
    },
    {
      handler: "updateQuestion",
      service: questionService,
      method: "updateQuestion",
      req: mockReq({ user: organiser, params: { roundId: "round-1", id: "q-1" }, body: fields }),
      args: ["q-1", "org-1", "organiser", fields],
      json: (result) => ok({ question: result }),
    },
    {
      handler: "deleteQuestion",
      service: questionService,
      method: "deleteQuestion",
      req: mockReq({ user: organiser, params: { id: "q-1" } }),
      args: ["q-1", "org-1", "organiser"],
      json: () => ok({ message: "Question deleted" }),
    },
  ]);
});

describe("markingController", () => {
  describeControllerCases(require("../../../src/controllers/markingController"), [
    {
      handler: "markRound",
      service: markingService,
      method: "autoMarkRound",
      req: mockReq({ user: organiser, params: { roundId: "round-1" } }),
      args: ["round-1", "org-1", "organiser"],
      json: (result) => ok({ result }),
    },
    {
      handler: "markAnswer",
      service: markingService,
      method: "markAnswer",
      req: mockReq({ user: organiser, params: { id: "ans-1" }, body: { is_correct: true, points_awarded: 3, marked_by: "x" } }),
      args: ["ans-1", "org-1", { is_correct: true, points_awarded: 3 }],
      json: (result) => ok({ result }),
    },
    {
      handler: "generateResults",
      service: markingService,
      method: "generateResults",
      req: mockReq({ user: organiser, params: { roundId: "round-1" } }),
      args: ["round-1", "org-1", "organiser"],
      json: (result) => ok({ result }),
    },
    {
      handler: "getMarkingQueue",
      service: markingService,
      method: "getMarkingQueue",
      req: mockReq({ user: organiser, params: { roundId: "round-1" } }),
      args: ["round-1", "org-1", "organiser"],
      json: (result) => ok({ submissions: result }),
    },
  ]);
});

describe("notificationRuleController", () => {
  const body = { name: "Reminder", trigger: "round_opens" };

  describeControllerCases(require("../../../src/controllers/notificationRuleController"), [
    {
      handler: "listRules",
      service: notificationRuleService,
      method: "listRules",
      req: mockReq({ user: organiser, params: { olympiadId: "oly-1" } }),
      args: ["oly-1", "org-1"],
      json: (result) => ok({ rules: result }),
    },
    {
      handler: "createRule",
      service: notificationRuleService,
      method: "createRule",
      req: mockReq({ user: organiser, params: { olympiadId: "oly-1" }, body }),
      args: [{ olympiadId: "oly-1", organiserId: "org-1", data: body }],
      status: 201,
      json: (result) => ok({ rule: result }),
    },
    {
      handler: "updateRule",
      service: notificationRuleService,
      method: "updateRule",
      req: mockReq({ user: organiser, params: { ruleId: "rule-1" }, body }),
      args: [{ ruleId: "rule-1", organiserId: "org-1", data: body }],
      json: (result) => ok({ rule: result }),
    },
    {
      handler: "deleteRule",
      service: notificationRuleService,
      method: "deleteRule",
      req: mockReq({ user: organiser, params: { ruleId: "rule-1" } }),
      args: ["rule-1", "org-1"],
      json: () => ok({ message: "Notification rule deleted" }),
    },
  ]);
});

describe("schoolController", () => {
  describeControllerCases(require("../../../src/controllers/schoolController"), [
    {
      handler: "listSchools",
      service: schoolService,
      method: "listSchools",
      req: mockReq({ user: organiser, params: { olympiadId: "oly-1" } }),
      args: ["oly-1", "org-1"],
      json: (result) => ok({ schools: result }),
    },
    {
      handler: "listArchive",
      service: paperService,
      method: "listArchive",
      req: mockReq({ user: organiser, params: { olympiadId: "oly-1" } }),
      args: ["oly-1", "org-1"],
      json: (result) => ok({ rounds: result }),
    },
  ]);
});
