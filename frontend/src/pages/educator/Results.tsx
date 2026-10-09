import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { PageHeader } from '../../components/layout/PageHeader';
import { Select } from '../../components/ui/Select';
import { TablePanel, Td, Th } from '../../components/ui/Table';
import { educatorNav } from '../../lib/mockData';
import {
    useAllEducatorResults,
    formatDateShort,
    type EducatorAllResultsRound,
} from '../../lib/educatorApi';
import styles from './Results.module.css';

function Results() {
    const { data: rounds, isLoading, error } = useAllEducatorResults();
    const [selectedRoundId, setSelectedRoundId] = useState('');

    // Auto-select first round when data loads
    const activeRoundId = selectedRoundId || rounds?.[0]?.id || '';
    const activeRound: EducatorAllResultsRound | undefined = rounds?.find(
        (r) => r.id === activeRoundId
    );

    return (
        <AppShell
            activeRole="educator"
            navItems={educatorNav}
            organisation=""
            portalLabel="Educator portal"
        >
            <div className={styles.stack}>
                <PageHeader
                    title="Results"
                    description="Auto-marked scores for your entrants, available once a round has closed and results are released."
                />

                {isLoading && (
                    <p className={styles.loading}>Loading results…</p>
                )}

                {error && (
                    <p className={styles.error}>
                        Failed to load results: {(error as Error).message}
                    </p>
                )}

                {!isLoading && (!rounds || rounds.length === 0) && (
                    <div className={styles.emptyState}>
                        <ClipboardList aria-hidden="true" />
                        <p>
                            No results available yet. Results appear once a
                            round closes and scores are released.
                        </p>
                    </div>
                )}

                {rounds && rounds.length > 0 && (
                    <>
                        <div className={styles.filterRow}>
                            <Select
                                id="round-select"
                                aria-label="Round"
                                value={activeRoundId}
                                onChange={(e) =>
                                    setSelectedRoundId(e.target.value)
                                }
                            >
                                {rounds.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.name}
                                    </option>
                                ))}
                            </Select>
                            {activeRound && (
                                <p>
                                    Closed{' '}
                                    {formatDateShort(
                                        activeRound.closes_at,
                                        activeRound.timezone
                                    )}{' '}
                                    · {activeRound.results.length} entrant
                                    {activeRound.results.length !== 1
                                        ? 's'
                                        : ''}
                                </p>
                            )}
                        </div>

                        {activeRound && activeRound.results.length > 0 ? (
                            <TablePanel minWidth="44rem">
                                <thead>
                                    <tr>
                                        <Th numeric>Rank</Th>
                                        <Th>Entrant</Th>
                                        <Th>Student no.</Th>
                                        <Th>Grade</Th>
                                        <Th numeric>Score</Th>
                                        <Th>Qualified</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeRound.results.map((r) => (
                                        <tr key={r.id}>
                                            <Td numeric>{r.rank ?? '—'}</Td>
                                            <Td strong muted={false}>
                                                {r.entrant.full_name}
                                            </Td>
                                            <Td>
                                                {r.entrant.external_ref ?? '—'}
                                            </Td>
                                            <Td>{r.entrant.grade ?? '—'}</Td>
                                            <Td numeric muted={false}>
                                                {Number(r.total_points)}
                                            </Td>
                                            <Td>
                                                {r.qualified ? 'Yes' : 'No'}
                                            </Td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TablePanel>
                        ) : (
                            <div className={styles.emptyState}>
                                <ClipboardList aria-hidden="true" />
                                <p>
                                    No results for your entrants in this round.
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </AppShell>
    );
}

export default Results;
