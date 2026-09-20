import { describe, expect, it, vi } from "vitest";
import { readStored, writeStored } from "../../../../src/pages/student/examStorage";

const KEY = "exam-answers-round-1";

describe("readStored", () => {
  it("starts empty when nothing has been saved", () => {
    expect(readStored(KEY)).toEqual({ answers: {}, dirty: [] });
  });

  it("reads back saved answers and unsynced question ids", () => {
    localStorage.setItem(KEY, JSON.stringify({ answers: { q1: "0,2", q2: "Pretoria" }, dirty: ["q2"] }));
    expect(readStored(KEY)).toEqual({ answers: { q1: "0,2", q2: "Pretoria" }, dirty: ["q2"] });
  });

  it("recovers from corrupted storage instead of crashing the exam", () => {
    localStorage.setItem(KEY, "{not json");
    expect(readStored(KEY)).toEqual({ answers: {}, dirty: [] });
  });

  it("fills in missing fields", () => {
    localStorage.setItem(KEY, JSON.stringify({}));
    expect(readStored(KEY)).toEqual({ answers: {}, dirty: [] });
  });

  it("ignores a dirty list that isn't an array", () => {
    localStorage.setItem(KEY, JSON.stringify({ answers: { q1: "1" }, dirty: "q1" }));
    expect(readStored(KEY)).toEqual({ answers: { q1: "1" }, dirty: [] });
  });

  it("keeps different rounds separate", () => {
    localStorage.setItem("exam-answers-round-2", JSON.stringify({ answers: { q9: "x" }, dirty: [] }));
    expect(readStored(KEY)).toEqual({ answers: {}, dirty: [] });
  });

  it("returns empty answers when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(readStored(KEY)).toEqual({ answers: {}, dirty: [] });
  });
});

describe("writeStored", () => {
  it("saves answers so a refresh doesn't lose them", () => {
    writeStored(KEY, { answers: { q1: "3" }, dirty: ["q1"] });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ answers: { q1: "3" }, dirty: ["q1"] });
    expect(readStored(KEY)).toEqual({ answers: { q1: "3" }, dirty: ["q1"] });
  });

  it("carries on silently when storage is full or blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => writeStored(KEY, { answers: { q1: "3" }, dirty: [] })).not.toThrow();
  });
});
