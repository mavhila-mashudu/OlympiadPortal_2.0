const { parseOptionList, scoreMcq, qualifies, paperMaxPoints, competitionRanks } = require("../../../src/services/markingMath");

describe("qualifies", () => {
  it("reads the threshold as a percentage of the paper's total marks", () => {
    // The reported case: 80% against a 20% threshold on a 10-mark paper
    expect(qualifies({ totalPoints: 8, maxPoints: 10, threshold: 20 })).toBe(true);
    expect(qualifies({ totalPoints: 12, maxPoints: 13, threshold: 80 })).toBe(true);
    expect(qualifies({ totalPoints: 4, maxPoints: 5, threshold: 80 })).toBe(true);
    expect(qualifies({ totalPoints: 3, maxPoints: 5, threshold: 80 })).toBe(false);
  });

  it("counts a score exactly on the threshold, without rounding it away", () => {
    // 57/100 as a division is 56.99999…%; compared by multiplying it's 57%
    expect(qualifies({ totalPoints: 57, maxPoints: 100, threshold: 57 })).toBe(true);
    expect(qualifies({ totalPoints: 3, maxPoints: 5, threshold: 60 })).toBe(true);
    expect(qualifies({ totalPoints: 62.5, maxPoints: 100, threshold: "62.5" })).toBe(true);
    expect(qualifies({ totalPoints: "62.49", maxPoints: "100", threshold: "62.5" })).toBe(false);
  });

  it("qualifies nobody without a threshold, and everybody at 0%", () => {
    expect(qualifies({ totalPoints: 10, maxPoints: 10, threshold: null })).toBe(false);
    expect(qualifies({ totalPoints: 10, maxPoints: 10, threshold: undefined })).toBe(false);
    expect(qualifies({ totalPoints: 0, maxPoints: 10, threshold: 0 })).toBe(true);
  });

  it("lets a paper worth no marks be passed only by a 0% threshold", () => {
    expect(qualifies({ totalPoints: 0, maxPoints: 0, threshold: 0 })).toBe(true);
    expect(qualifies({ totalPoints: 0, maxPoints: 0, threshold: 50 })).toBe(false);
  });
});

describe("competitionRanks", () => {
  it("gives equal totals the same rank and skips the next", () => {
    const totals = ["90", "85", "85", "70", "70", "70", "10"].map((total_points) => ({ total_points }));
    expect(competitionRanks(totals)).toEqual([1, 2, 2, 4, 4, 4, 7]);
  });

  it("treats a Decimal string and a number of the same value as equal", () => {
    expect(competitionRanks([{ total_points: "8" }, { total_points: 8 }, { total_points: "7.5" }])).toEqual([1, 1, 3]);
  });

  it("ranks an empty list as empty", () => {
    expect(competitionRanks([])).toEqual([]);
  });
});

describe("paperMaxPoints", () => {
  it("adds up the marks of every question on the round's paper", async () => {
    const db = { questions: { aggregate: jest.fn().mockResolvedValue({ _sum: { max_points: "13" } }) } };
    await expect(paperMaxPoints(db, "round-1")).resolves.toBe(13);
    expect(db.questions.aggregate).toHaveBeenCalledWith({ where: { papers: { round_id: "round-1" } }, _sum: { max_points: true } });
  });

  it("is 0 for a round with no questions", async () => {
    const db = { questions: { aggregate: jest.fn().mockResolvedValue({ _sum: { max_points: null } }) } };
    await expect(paperMaxPoints(db, "round-1")).resolves.toBe(0);
  });
});

describe("parseOptionList", () => {
  it("splits a comma-separated list and trims each entry", () => {
    expect(parseOptionList("0, 2,3")).toEqual(["0", "2", "3"]);
  });

  it("drops empty segments", () => {
    expect(parseOptionList("0,,2, ")).toEqual(["0", "2"]);
  });

  it.each([null, undefined, ""])("returns an empty list for %p", (value) => {
    expect(parseOptionList(value)).toEqual([]);
  });

  it("accepts a bare number", () => {
    expect(parseOptionList(1)).toEqual(["1"]);
  });
});

describe("scoreMcq", () => {
  const score = (overrides) =>
    scoreMcq({ maxPoints: 6, correctOption: "0,1,2", negativePct: 10, ...overrides });

  describe("worked examples from the marking rules", () => {
    it("gives partial credit: 2 of 3 correct, no wrong picks → 4", () => {
      expect(score({ selected: "0,1" })).toEqual({ isCorrect: false, points: 4 });
    });

    it("deducts per wrong pick: 1 correct, 2 wrong → 2 − 1.2 = 0.8", () => {
      expect(score({ selected: "0,3,4" })).toEqual({ isCorrect: false, points: 0.8 });
    });

    it("never goes below zero: 0 correct, 3 wrong → 0", () => {
      expect(score({ selected: "3,4,5" })).toEqual({ isCorrect: false, points: 0 });
    });
  });

  it("awards full marks and isCorrect for exactly the correct set", () => {
    expect(score({ selected: "2,0,1" })).toEqual({ isCorrect: true, points: 6 });
  });

  it("is not fully correct when every right option plus a wrong one is picked", () => {
    expect(score({ selected: "0,1,2,3" })).toEqual({ isCorrect: false, points: 5.4 });
  });

  describe("single-answer questions", () => {
    const single = (selected) =>
      scoreMcq({ maxPoints: 2, correctOption: "1", selected, negativePct: 0 });

    it("scores a right answer", () => {
      expect(single("1")).toEqual({ isCorrect: true, points: 2 });
    });

    it("scores a wrong answer as zero", () => {
      expect(single("0")).toEqual({ isCorrect: false, points: 0 });
    });

    it("scores an unanswered question as zero", () => {
      expect(single(null)).toEqual({ isCorrect: false, points: 0 });
    });
  });

  it("handles True/False as the two-option case", () => {
    const tf = (selected) => scoreMcq({ maxPoints: 1, correctOption: "0", selected });
    expect(tf("0")).toEqual({ isCorrect: true, points: 1 });
    expect(tf("1")).toEqual({ isCorrect: false, points: 0 });
  });

  it("applies no penalty when negativePct is 0 or missing", () => {
    expect(score({ selected: "0,3", negativePct: 0 }).points).toBe(2);
    expect(score({ selected: "0,3", negativePct: undefined }).points).toBe(2);
  });

  it("rounds points to two decimal places", () => {
    // 1 mark split across 3 correct options = 0.333…
    expect(
      scoreMcq({ maxPoints: 1, correctOption: "0,1,2", selected: "0" }).points,
    ).toBe(0.33);
  });

  it("accepts numeric strings from the database (Decimal columns)", () => {
    expect(
      scoreMcq({ maxPoints: "4", correctOption: "0,1", selected: "0,2", negativePct: "25" }),
    ).toEqual({ isCorrect: false, points: 1 });
  });

  it("scores zero when the question has no correct options configured", () => {
    expect(scoreMcq({ maxPoints: 5, correctOption: null, selected: "0" })).toEqual({
      isCorrect: false,
      points: 0,
    });
  });

  it("treats a missing max_points as zero", () => {
    expect(scoreMcq({ maxPoints: null, correctOption: "0", selected: "0" }).points).toBe(0);
  });

  it("counts a repeated selection only once", () => {
    // Regression: "0,0" used to earn option 0's credit twice, so a
    // student could get full marks on a two-answer question.
    expect(
      scoreMcq({ maxPoints: 2, correctOption: "0,1", selected: "0,0" }),
    ).toEqual({ isCorrect: false, points: 1 });
  });
});
