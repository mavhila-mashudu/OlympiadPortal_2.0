import type {
  EducatorOverview,
  EducatorOverviewEntrant,
  EducatorRound,
} from "../../lib/educatorApi";

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

export type GlanceStats = {
  entrantCount: number;
  openRounds: number;
  resultsOut: number;
  qualifiers: number;
};

export function getGlanceStats(overview: EducatorOverview): GlanceStats {
  const rounds = overview.olympiads.flatMap((olympiad) => olympiad.rounds);
  return {
    entrantCount: overview.entrants.length,
    openRounds: rounds.filter((round) => round.status === "open").length,
    resultsOut: rounds.filter((round) => round.results_available).length,
    qualifiers: rounds.reduce(
      (sum, round) => sum + (round.qualified_count ?? 0),
      0,
    ),
  };
}

export function getOlympiadEntrants(
  overview: EducatorOverview,
  olympiadId: string,
): EducatorOverviewEntrant[] {
  return overview.entrants.filter((entrant) =>
    entrant.rounds.some((round) => round.olympiad_id === olympiadId),
  );
}
