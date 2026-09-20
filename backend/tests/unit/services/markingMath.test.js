const { parseOptionList, scoreMcq } = require("../../../src/services/markingMath");

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
