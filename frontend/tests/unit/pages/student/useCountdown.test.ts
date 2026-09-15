import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountdown } from "../../../../src/pages/student/useCountdown";

const NOW = new Date("2026-06-01T09:00:00Z");
const SEC = 1000;
const MIN = 60 * SEC;
const closesIn = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useCountdown", () => {
  it("shows the time left as HH:MM:SS straight away", () => {
    const { result } = renderHook(() => useCountdown(closesIn(90 * MIN + 5 * SEC)));
    expect(result.current).toEqual({ remaining: "01:30:05", expired: false, urgent: false });
  });

  it("ticks down every second", () => {
    const { result } = renderHook(() => useCountdown(closesIn(10 * MIN)));
    act(() => {
      vi.advanceTimersByTime(3 * SEC);
    });
    expect(result.current.remaining).toBe("00:09:57");
  });

  it("turns urgent in the final five minutes", () => {
    const { result } = renderHook(() => useCountdown(closesIn(5 * MIN + 2 * SEC)));
    expect(result.current.urgent).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2 * SEC);
    });
    expect(result.current).toMatchObject({ remaining: "00:05:00", urgent: true });
  });

  it("expires at the close time and stops ticking", () => {
    const { result } = renderHook(() => useCountdown(closesIn(2 * SEC)));

    act(() => {
      vi.advanceTimersByTime(2 * SEC);
    });
    expect(result.current).toEqual({ remaining: "Time expired", expired: true, urgent: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is already expired when opened after the close time", () => {
    const { result } = renderHook(() => useCountdown(closesIn(-MIN)));
    expect(result.current).toMatchObject({ remaining: "Time expired", expired: true });
  });

  it("uses the server clock offset so a wrong device clock can't add time", () => {
    // Device clock is 2 minutes behind the server: offset = +2 min
    const { result } = renderHook(() => useCountdown(closesIn(10 * MIN), 2 * MIN));
    expect(result.current.remaining).toBe("00:08:00");
  });

  it("restarts when the close time changes", () => {
    const { result, rerender } = renderHook(({ closesAt }) => useCountdown(closesAt), {
      initialProps: { closesAt: closesIn(MIN) },
    });
    expect(result.current.remaining).toBe("00:01:00");

    rerender({ closesAt: closesIn(2 * 60 * MIN) });
    expect(result.current.remaining).toBe("02:00:00");
    expect(vi.getTimerCount()).toBe(1);
  });

  it("stops its timer when the exam page unmounts", () => {
    const { unmount } = renderHook(() => useCountdown(closesIn(10 * MIN)));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
