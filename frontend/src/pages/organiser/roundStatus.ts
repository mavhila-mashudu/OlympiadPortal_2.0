import type { RoundStatus } from '../../lib/mockData';

export type RoundState =
    'scheduled' | 'open' | 'closed' | 'marking' | 'results_released';

// Collapse the round lifecycle into the three badge states
export function toBadgeStatus(state: RoundState): RoundStatus {
    if (state === 'open') return 'open';
    if (state === 'scheduled') return 'upcoming';
    return 'closed';
}
