import { useEffect, useRef, useState } from "react";

// Live countdown to closesAt as HH:MM:SS. offsetMs is the server clock minus
// the local clock, so a skewed device clock can't change the time allowed.
export function useCountdown(closesAt: string, offsetMs = 0) {
  const [remaining, setRemaining] = useState("");
  const [expired, setExpired] = useState(false);
  const [urgent, setUrgent] = useState(false);
  // Milliseconds to the close, or null before the close time is known
  const [msLeft, setMsLeft] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );

  useEffect(() => {
    const closes = new Date(closesAt).getTime();
    // No close time yet (the exam is still loading): show nothing rather
    // than counting down to an invalid date
    if (Number.isNaN(closes)) {
      setRemaining("");
      setExpired(false);
      setUrgent(false);
      setMsLeft(null);
      return;
    }

    function tick() {
      // Apply the server-clock offset so a skewed
      // local clock can't extend or shorten the exam
      const now = Date.now() + offsetMs;
      const diff = closes - now;
      setMsLeft(Math.max(0, diff));

      if (diff <= 0) {
        setRemaining("Time expired");
        setExpired(true);
        setUrgent(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      // Final five minutes — the timer turns red
      setUrgent(diff <= 5 * 60 * 1000);
      setRemaining(
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
      );
    }

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [closesAt, offsetMs]);

  return { remaining, expired, urgent, msLeft };
}
