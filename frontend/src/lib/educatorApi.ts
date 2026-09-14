import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

// ── Type definitions ───────────────────────────────────────

export type RoundStatus = "upcoming" | "open" | "closed";

export type EducatorSchool = {
  id: string;
  name: string;
};

export type EducatorRound = {
  id: string;
  name: string;
  olympiad_id: string;
  olympiad_name: string;
  opens_at: string;
  closes_at: string;
  state: string;
  status: RoundStatus;
  has_paper: boolean;
  submission_count: number;
  entrant_count: number;
};

export type EducatorRoundPaper = {
  id: string;
  title: string;
  has_paper: boolean;
  has_memo: boolean;
};

export type EducatorRoundSubmission = {
  id: string;
  received_at: string;
  status: string;
  route: string;
};

export type EducatorRoundDetail = {
  id: string;
  name: string;
  olympiad_id: string;
  olympiad_name: string;
  opens_at: string;
  closes_at: string;
  results_release_at: string | null;
  state: string;
  status: RoundStatus;
  paper: EducatorRoundPaper | null;
  has_submitted: boolean;
  submission: EducatorRoundSubmission | null;
  results_available: boolean;
  school: EducatorSchool;
};

export type EducatorEntrant = {
  id: string;
  full_name: string;
  grade: string | null;
  external_ref: string | null;
  registered_at: string;
};

export type EducatorResult = {
  id: string;
  rank: number | null;
  total_points: number;
  qualified: boolean;
  entrant: {
    id: string;
    full_name: string;
    grade: string | null;
    external_ref: string | null;
  };
};

export type EducatorRoundResults = {
  round: {
    id: string;
    name: string;
    state: string;
    closes_at: string;
  };
  results: EducatorResult[];
};

export type EducatorAllResultsRound = {
  id: string;
  name: string;
  olympiad_name: string;
  closes_at: string;
  results: EducatorResult[];
};

export type PastPaper = {
  id: string;
  round_id: string;
  round_name: string;
  title: string;
  closed_at: string;
  has_paper: boolean;
  has_memo: boolean;
};

export type SubmissionReceipt = {
  submission: {
    id: string;
    round_id: string;
    entrant_id: string;
    received_at: string;
    status: string;
    route: string;
  };
  answers: Array<{
    id: string;
    question_id: string;
    answer_value: string | null;
    is_correct: boolean | null;
    points_awarded: number | null;
  }>;
  totalPoints: number;
  autoMarked: boolean;
};

// ── Date formatting helper ─────────────────────────────────

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

// ── Query hooks ────────────────────────────────────────────

export function useEducatorRounds() {
  return useQuery({
    queryKey: ["educator", "rounds"],
    queryFn: () =>
      api.get<{ rounds: EducatorRound[]; school: EducatorSchool }>(
        "/educator/rounds",
      ),
  });
}

export function useEducatorRoundDetail(roundId: string) {
  return useQuery({
    queryKey: ["educator", "rounds", roundId],
    queryFn: () =>
      api
        .get<{ round: EducatorRoundDetail }>(`/educator/rounds/${roundId}`)
        .then((d) => d.round),
    enabled: !!roundId,
  });
}

export function useEducatorEntrants(roundId: string) {
  return useQuery({
    queryKey: ["educator", "rounds", roundId, "entrants"],
    queryFn: () =>
      api
        .get<{ entrants: EducatorEntrant[] }>(
          `/educator/rounds/${roundId}/entrants`,
        )
        .then((d) => d.entrants),
    enabled: !!roundId,
  });
}

export function useEducatorResults(roundId: string) {
  return useQuery({
    queryKey: ["educator", "rounds", roundId, "results"],
    queryFn: () =>
      api.get<EducatorRoundResults>(`/educator/rounds/${roundId}/results`),
    enabled: !!roundId,
  });
}

export function useAllEducatorResults() {
  return useQuery({
    queryKey: ["educator", "results"],
    queryFn: () =>
      api
        .get<{ rounds: EducatorAllResultsRound[] }>("/educator/results")
        .then((d) => d.rounds),
  });
}

export function usePastPapers(roundId: string) {
  return useQuery({
    queryKey: ["educator", "rounds", roundId, "past-papers"],
    queryFn: () =>
      api
        .get<{ papers: PastPaper[] }>(
          `/educator/rounds/${roundId}/papers/past`,
        )
        .then((d) => d.papers),
    enabled: !!roundId,
  });
}

// ── Mutation hooks ─────────────────────────────────────────

export function useRegisterEntrants(roundId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      entrants: Array<{
        full_name: string;
        grade?: string;
        external_ref?: string;
      }>,
    ) =>
      api.post<{ entrants: EducatorEntrant[] }>(
        `/educator/rounds/${roundId}/entrants`,
        { entrants },
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["educator", "rounds", roundId, "entrants"],
      });
      qc.invalidateQueries({ queryKey: ["educator", "rounds"] });
    },
  });
}

export function useSubmitResults(roundId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      entrant_id: string;
      route?: string;
      answers: Array<{ question_id: string; answer_value?: string }>;
    }) =>
      api.post<SubmissionReceipt>(`/rounds/${roundId}/submissions`, body),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["educator", "rounds", roundId],
      });
      qc.invalidateQueries({ queryKey: ["educator", "rounds"] });
    },
  });
}

// ── Paper download helper ──────────────────────────────────

export async function downloadPaperFile(
  roundId: string,
  type: "paper" | "memo" = "paper",
): Promise<void> {
  const { url } = await api.get<{ url: string }>(
    `/educator/rounds/${roundId}/paper/download?type=${type}`,
  );
  window.open(url, "_blank");
}

export async function downloadPastPaper(
  paperId: string,
): Promise<void> {
  // Past papers use the same download endpoint via their round_id
  // The paper ID isn't directly usable here; callers should pass roundId
  // This is a convenience wrapper; the actual download is handled inline
  const { url } = await api.get<{ url: string }>(
    `/papers/by-round/${paperId}?type=paper`,
  );
  window.open(url, "_blank");
}
