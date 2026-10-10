import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { formatDateInZone, formatDateTimeInZone } from './time';

// ── Type definitions ───────────────────────────────────────

export type RoundStatus = 'upcoming' | 'open' | 'closed';

export type EducatorSchool = {
    id: string;
    name: string;
};

export type EducatorRound = {
    id: string;
    name: string;
    olympiad_id: string;
    olympiad_name: string;
    // The olympiad's IANA timezone; round times are shown in it
    timezone: string;
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
    entrant: { id: string; full_name: string };
    received_at: string;
    status: string;
    route: string;
};

export type EducatorRoundDetail = {
    id: string;
    name: string;
    olympiad_id: string;
    olympiad_name: string;
    // The olympiad's IANA timezone; round times are shown in it
    timezone: string;
    opens_at: string;
    closes_at: string;
    results_release_at: string | null;
    state: string;
    status: RoundStatus;
    paper: EducatorRoundPaper | null;
    // Every submission for the school's learners in this round
    submissions: EducatorRoundSubmission[];
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
    timezone: string;
    closes_at: string;
    results: EducatorResult[];
};

export type PastPaper = {
    id: string;
    round_id: string;
    round_name: string;
    title: string;
    closed_at: string;
    timezone: string;
    has_paper: boolean;
    has_memo: boolean;
};

export type ProgressionInfo = {
    requiresQualification: boolean;
    previousRound: {
        id: string;
        name: string;
        qualifyingThreshold: number | null;
    } | null;
    qualifiedEntrantIds: string[];
};

export type OlympiadEntrant = {
    id: string;
    full_name: string;
    grade: string | null;
    external_ref: string | null;
    rounds: Array<{ id: string; name: string }>;
};

export type RoundProgressionInfo = {
    roundId: string;
    roundName: string;
    requiresQualification: boolean;
    previousRound: {
        id: string;
        name: string;
        qualifyingThreshold: number | null;
    } | null;
    qualifiedEntrantIds: string[];
    state: string;
};

export type OlympiadProgressionInfo = {
    rounds: RoundProgressionInfo[];
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

export type EducatorOverviewRound = {
    id: string;
    name: string;
    state: string;
    status: RoundStatus;
    opens_at: string;
    closes_at: string;
    entrant_count: number;
    submitted_count: number;
    results_available: boolean;
    school_average: number | null;
    qualified_count: number | null;
    top_rank: number | null;
};

export type EducatorOverviewOlympiad = {
    id: string;
    name: string;
    rounds: EducatorOverviewRound[];
};

export type EducatorOverviewEntrantRound = {
    round_id: string;
    round_name: string;
    olympiad_id: string | null;
    state: string | null;
    submitted: boolean;
    submitted_at: string | null;
    score: number | null;
    rank: number | null;
    qualified: boolean | null;
};

export type EducatorOverviewEntrant = {
    id: string;
    full_name: string;
    grade: string | null;
    external_ref: string | null;
    rounds: EducatorOverviewEntrantRound[];
};

export type EducatorOverview = {
    school: EducatorSchool;
    olympiads: EducatorOverviewOlympiad[];
    entrants: EducatorOverviewEntrant[];
};

// ── Date formatting helper ─────────────────────────────────

// Round times are shown in the olympiad's timezone, labelled, so every
// school reads the same official times whatever its devices are set to
export function formatDate(iso: string, timeZone: string): string {
    return formatDateTimeInZone(iso, timeZone);
}

export function formatDateShort(iso: string, timeZone: string): string {
    return formatDateInZone(iso, timeZone);
}

// ── Query hooks ────────────────────────────────────────────

export function useEducatorRounds() {
    return useQuery({
        queryKey: ['educator', 'rounds'],
        queryFn: () =>
            api.get<{ rounds: EducatorRound[]; school: EducatorSchool }>(
                '/educator/rounds'
            ),
    });
}

export function useEducatorOverview() {
    return useQuery({
        queryKey: ['educator', 'overview'],
        queryFn: () => api.get<EducatorOverview>('/educator/overview'),
    });
}

export function useEducatorRoundDetail(roundId: string) {
    return useQuery({
        queryKey: ['educator', 'rounds', roundId],
        queryFn: () =>
            api
                .get<{ round: EducatorRoundDetail }>(
                    `/educator/rounds/${roundId}`
                )
                .then((d) => d.round),
        enabled: !!roundId,
    });
}

export function useEducatorEntrants(roundId: string) {
    return useQuery({
        queryKey: ['educator', 'rounds', roundId, 'entrants'],
        queryFn: () =>
            api
                .get<{ entrants: EducatorEntrant[] }>(
                    `/educator/rounds/${roundId}/entrants`
                )
                .then((d) => d.entrants),
        enabled: !!roundId,
    });
}

export function useProgressionInfo(roundId: string) {
    return useQuery({
        queryKey: ['educator', 'rounds', roundId, 'progression'],
        queryFn: () =>
            api.get<ProgressionInfo>(`/educator/rounds/${roundId}/progression`),
        enabled: !!roundId,
    });
}

export function useOlympiadEntrants(olympiadId: string) {
    return useQuery({
        queryKey: ['educator', 'olympiads', olympiadId, 'entrants'],
        queryFn: () =>
            api
                .get<{ entrants: OlympiadEntrant[] }>(
                    `/educator/olympiads/${olympiadId}/entrants`
                )
                .then((d) => d.entrants),
        enabled: !!olympiadId,
    });
}

export function useOlympiadProgressionInfo(olympiadId: string) {
    return useQuery({
        queryKey: ['educator', 'olympiads', olympiadId, 'progression'],
        queryFn: () =>
            api.get<OlympiadProgressionInfo>(
                `/educator/olympiads/${olympiadId}/progression`
            ),
        enabled: !!olympiadId,
    });
}

export function useRegisterEntrantsForOlympiad(olympiadId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (
            entrants: Array<{
                full_name: string;
                grade?: string;
                external_ref?: string;
            }>
        ) =>
            api.post<{ entrants: OlympiadEntrant[] }>(
                `/educator/olympiads/${olympiadId}/entrants`,
                { entrants }
            ),
        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: ['educator', 'olympiads', olympiadId, 'entrants'],
            });
            qc.invalidateQueries({ queryKey: ['educator', 'rounds'] });
        },
    });
}

export function useEducatorResults(roundId: string) {
    return useQuery({
        queryKey: ['educator', 'rounds', roundId, 'results'],
        queryFn: () =>
            api.get<EducatorRoundResults>(
                `/educator/rounds/${roundId}/results`
            ),
        enabled: !!roundId,
    });
}

export function useAllEducatorResults() {
    return useQuery({
        queryKey: ['educator', 'results'],
        queryFn: () =>
            api
                .get<{ rounds: EducatorAllResultsRound[] }>('/educator/results')
                .then((d) => d.rounds),
    });
}

export function usePastPapers(roundId: string) {
    return useQuery({
        queryKey: ['educator', 'rounds', roundId, 'past-papers'],
        queryFn: () =>
            api
                .get<{ papers: PastPaper[] }>(
                    `/educator/rounds/${roundId}/papers/past`
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
            }>
        ) =>
            api.post<{ entrants: EducatorEntrant[] }>(
                `/educator/rounds/${roundId}/entrants`,
                { entrants }
            ),
        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: ['educator', 'rounds', roundId, 'entrants'],
            });
            qc.invalidateQueries({ queryKey: ['educator', 'rounds'] });
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
                queryKey: ['educator', 'rounds', roundId],
            });
            qc.invalidateQueries({ queryKey: ['educator', 'rounds'] });
        },
    });
}

// ── Paper download helper ──────────────────────────────────

export async function downloadPaperFile(
    roundId: string,
    type: 'paper' | 'memo' = 'paper'
): Promise<void> {
    const { url } = await api.get<{ url: string }>(
        `/educator/rounds/${roundId}/paper/download?type=${type}`
    );
    window.open(url, '_blank');
}

export async function downloadPastPaper(paperId: string): Promise<void> {
    // Past papers use the same download endpoint via their round_id
    // The paper ID isn't directly usable here; callers should pass roundId
    // This is a convenience wrapper; the actual download is handled inline
    const { url } = await api.get<{ url: string }>(
        `/papers/by-round/${paperId}?type=paper`
    );
    window.open(url, '_blank');
}
