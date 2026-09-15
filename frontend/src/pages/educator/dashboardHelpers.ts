import type { EducatorRound } from "../../lib/educatorApi";

export function getCountdown(target: string): string {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return "";
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${mins}m`;
}

export function getRoundNote(round: EducatorRound): string {
  switch (round.status) {
    case "open":
      return round.submission_count > 0
        ? "Submission received"
        : "Closes in";
    case "upcoming":
      return "Opens in";
    default:
      return round.submission_count > 0
        ? "Submission received"
        : "Closed";
  }
}

export function getSecondaryAction(round: EducatorRound): string | null {
  if (round.status === "closed") return "View results";
  if (round.status === "upcoming") return "Register entrants";
  return null;
}
