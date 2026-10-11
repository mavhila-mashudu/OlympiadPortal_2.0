import { useEffect, useState } from 'react';
import { Award, Download, FileText, Pencil } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { api, downloadCertificate } from '../../lib/api';
import { studentNav } from '../../lib/mockData';
import {
    formatDateTime,
    getStudentProfile,
    type StudentProfile,
} from '../../lib/student';
import styles from './RoundDetail.module.css';

type RoundDetailData = {
    id: string;
    title: string;
    olympiadTitle: string;
    schoolName: string;
    // The olympiad's IANA timezone; times are shown in it
    timezone: string;
    opens_at: string;
    closes_at: string;
    status: 'upcoming' | 'open' | 'closed';
    canSitOnline: boolean;
    hasSubmitted: boolean;
    submissionStatus: string | null;
    paperFile: string;
    hasPaper: boolean;
    paperNote: string;
    result: {
        score: string;
        percentage: string;
        rankInSchool: number | null;
        hasCertificate: boolean;
    } | null;
    remarkStatus?: 'pending' | 'reviewed' | null;
    remarkReason?: string | null;
    remarkNote?: string | null;
    remarkReviewedAt?: string | null;
};

function StudentRoundDetail() {
    const { id } = useParams<{ id: string }>();
    const [profile, setProfile] = useState<StudentProfile>({
        userName: 'Student',
        userInitials: 'ST',
        organisation: 'Loading...',
    });
    const [round, setRound] = useState<RoundDetailData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [remarkReason, setRemarkReason] = useState('');
    const [remarkSubmitting, setRemarkSubmitting] = useState(false);
    const [remarkError, setRemarkError] = useState<string | null>(null);
    const [remarkSuccess, setRemarkSuccess] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            if (!id) return;
            setLoading(true);
            setError(null);
            try {
                const [prof, roundRes] = await Promise.all([
                    getStudentProfile(),
                    api.get<{ round: RoundDetailData }>(`/me/rounds/${id}`),
                ]);

                if (!cancelled) {
                    setProfile(prof);
                    setRound(roundRes.round);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : 'Failed to load round details'
                    );
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [id]);

    if (loading) {
        return (
            <AppShell
                activeRole="student"
                navItems={studentNav}
                organisation={profile.organisation}
                portalLabel="Student portal"
            >
                <div className={styles.stack}>
                    <p className={styles.noResult}>Loading round details…</p>
                </div>
            </AppShell>
        );
    }

    if (error || !round) {
        return (
            <AppShell
                activeRole="student"
                navItems={studentNav}
                organisation={profile.organisation}
                portalLabel="Student portal"
            >
                <div className={styles.stack}>
                    <p className={styles.notFound}>
                        {error ||
                            'Round not found or you are not registered for it.'}
                    </p>
                    <div>
                        <Button to="/student" variant="outline">
                            Back to dashboard
                        </Button>
                    </div>
                </div>
            </AppShell>
        );
    }

    const paperAvailable = round.status === 'open' || round.status === 'closed';
    const showResult = round.status === 'closed';

    // The paper lives in private storage, so ask the backend for a short-lived
    // signed link and open that
    const handleDownloadPaper = async () => {
        setDownloading(true);
        setDownloadError(null);
        try {
            const { url } = await api.get<{ url: string }>(
                `/rounds/${round.id}/paper/download`
            );
            window.open(url, '_blank');
        } catch (err) {
            setDownloadError(
                err instanceof Error
                    ? err.message
                    : 'Could not download the paper'
            );
        } finally {
            setDownloading(false);
        }
    };

    return (
        <AppShell
            activeRole="student"
            navItems={studentNav}
            organisation={profile.organisation}
            portalLabel="Student portal"
        >
            <div className={styles.stack}>
                <header className={styles.pageHeader}>
                    <div>
                        <h1>{round.title}</h1>
                        <p>
                            {round.schoolName || profile.organisation} · Closes{' '}
                            {formatDateTime(round.closes_at, round.timezone)}
                        </p>
                    </div>
                    <div className={styles.pageActions}>
                        <Button to="/student" variant="outline">
                            Back to rounds
                        </Button>
                    </div>
                </header>

                <div className={styles.statusRow}>
                    <StatusBadge status={round.status} />
                </div>

                <Card
                    className={styles.sectionCard}
                    padded={false}
                    aria-labelledby="paper-heading"
                >
                    <div className={styles.sectionHeader}>
                        <h2 id="paper-heading">Question paper</h2>
                    </div>
                    <div className={styles.paperBody}>
                        <span className={styles.paperFile}>
                            <FileText aria-hidden="true" />
                            <span className={styles.paperFileName}>
                                <span>{round.paperFile}</span>
                                <small>{round.paperNote}</small>
                            </span>
                        </span>
                        <div className={styles.paperActions}>
                            {round.canSitOnline && !round.hasSubmitted && (
                                <Button
                                    icon={<Pencil aria-hidden="true" />}
                                    variant="primary"
                                    to={`/student/rounds/${round.id}/exam`}
                                >
                                    Sit exam online
                                </Button>
                            )}
                            {round.hasSubmitted && (
                                <Button variant="outline" disabled>
                                    Exam submitted (
                                    {round.submissionStatus || 'received'})
                                </Button>
                            )}
                            <Button
                                icon={<Download aria-hidden="true" />}
                                variant={
                                    round.status === 'open'
                                        ? 'outline'
                                        : 'primary'
                                }
                                disabled={
                                    !paperAvailable ||
                                    !round.hasPaper ||
                                    downloading
                                }
                                onClick={handleDownloadPaper}
                            >
                                {downloading
                                    ? 'Preparing download…'
                                    : 'Download paper'}
                            </Button>
                        </div>
                    </div>
                    {downloadError && (
                        <p className={styles.downloadError} role="alert">
                            {downloadError}
                        </p>
                    )}
                </Card>

                {showResult ? (
                    <Card
                        className={styles.sectionCard}
                        padded={false}
                        aria-labelledby="result-heading"
                    >
                        <div className={styles.sectionHeader}>
                            <h2 id="result-heading">Your result</h2>
                        </div>
                        <div className={styles.resultBody}>
                            {round.result ? (
                                <>
                                    <dl className={styles.resultGrid}>
                                        <div>
                                            <dt>Score</dt>
                                            <dd>{round.result.score}</dd>
                                        </div>
                                        <div>
                                            <dt>Percentage</dt>
                                            <dd>{round.result.percentage}</dd>
                                        </div>
                                        <div>
                                            <dt>Rank in school</dt>
                                            <dd>{round.result.rankInSchool}</dd>
                                        </div>
                                    </dl>
                                    {round.result.hasCertificate ? (
                                        <div
                                            className={styles.certificateBanner}
                                        >
                                            <span>
                                                <Award aria-hidden="true" />
                                                You earned a certificate for
                                                this round.
                                            </span>
                                            <Button
                                                icon={
                                                    <Download aria-hidden="true" />
                                                }
                                                size="sm"
                                                variant="outline"
                                                onClick={() =>
                                                    downloadCertificate(
                                                        round.id
                                                    ).catch((err) =>
                                                        setDownloadError(
                                                            err.message
                                                        )
                                                    )
                                                }
                                            >
                                                Download certificate
                                            </Button>
                                        </div>
                                    ) : null}

                                    <div className={styles.remarkBox}>
                                        <div className={styles.remarkHeader}>
                                            <h3>Remark request</h3>
                                            {round.remarkStatus ? (
                                                <span
                                                    className={`${styles.remarkBadge} ${styles[round.remarkStatus]}`}
                                                >
                                                    {round.remarkStatus ===
                                                    'pending'
                                                        ? 'Pending review'
                                                        : 'Reviewed'}
                                                </span>
                                            ) : null}
                                        </div>

                                        {round.remarkStatus ? (
                                            <div
                                                className={
                                                    styles.remarkStatusContainer
                                                }
                                            >
                                                <p
                                                    className={
                                                        styles.remarkStatusText
                                                    }
                                                >
                                                    {round.remarkStatus ===
                                                    'pending'
                                                        ? 'Your remark request has been submitted and is currently being processed by an assigned educator.'
                                                        : `Your remark request has been reviewed${
                                                              round.remarkReviewedAt
                                                                  ? ` on ${formatDateTime(round.remarkReviewedAt, round.timezone)}`
                                                                  : ''
                                                          }. Any mark adjustments have been applied to your score above.`}
                                                </p>

                                                {round.remarkReason && (
                                                    <div
                                                        className={
                                                            styles.originalReasonBox
                                                        }
                                                    >
                                                        <span
                                                            className={
                                                                styles.reasonBoxTitle
                                                            }
                                                        >
                                                            Your Appeal Reason
                                                        </span>
                                                        <p
                                                            className={
                                                                styles.reasonBoxText
                                                            }
                                                        >
                                                            {round.remarkReason}
                                                        </p>
                                                    </div>
                                                )}

                                                {round.remarkStatus ===
                                                    'reviewed' &&
                                                    round.remarkNote && (
                                                        <div
                                                            className={
                                                                styles.reviewFeedbackBox
                                                            }
                                                        >
                                                            <span
                                                                className={
                                                                    styles.feedbackTitle
                                                                }
                                                            >
                                                                Educator Review
                                                                Feedback
                                                            </span>
                                                            <p
                                                                className={
                                                                    styles.feedbackText
                                                                }
                                                            >
                                                                {
                                                                    round.remarkNote
                                                                }
                                                            </p>
                                                        </div>
                                                    )}
                                            </div>
                                        ) : (
                                            <>
                                                <textarea
                                                    className={
                                                        styles.remarkInput
                                                    }
                                                    value={remarkReason}
                                                    onChange={(event) =>
                                                        setRemarkReason(
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder="Explain why you think this result should be reviewed."
                                                    rows={3}
                                                />
                                                {remarkError && (
                                                    <p
                                                        className={
                                                            styles.remarkError
                                                        }
                                                        role="alert"
                                                    >
                                                        {remarkError}
                                                    </p>
                                                )}
                                                {remarkSuccess && (
                                                    <p
                                                        className={
                                                            styles.remarkSuccess
                                                        }
                                                    >
                                                        {remarkSuccess}
                                                    </p>
                                                )}
                                                <div
                                                    className={
                                                        styles.remarkActions
                                                    }
                                                >
                                                    <Button
                                                        variant="primary"
                                                        onClick={async () => {
                                                            if (
                                                                !round ||
                                                                !remarkReason.trim()
                                                            ) {
                                                                setRemarkError(
                                                                    'Please add a reason for the remark request.'
                                                                );
                                                                return;
                                                            }
                                                            setRemarkSubmitting(
                                                                true
                                                            );
                                                            setRemarkError(
                                                                null
                                                            );
                                                            setRemarkSuccess(
                                                                null
                                                            );
                                                            try {
                                                                const submittedReason =
                                                                    remarkReason.trim();
                                                                await api.post(
                                                                    `/rounds/${round.id}/remark`,
                                                                    {
                                                                        reason: submittedReason,
                                                                    }
                                                                );
                                                                setRemarkReason(
                                                                    ''
                                                                );
                                                                setRemarkSuccess(
                                                                    'Remark request submitted. It will be reviewed by an educator.'
                                                                );
                                                                setRound(
                                                                    (
                                                                        current
                                                                    ) =>
                                                                        current
                                                                            ? {
                                                                                  ...current,
                                                                                  remarkStatus:
                                                                                      'pending',
                                                                                  remarkReason:
                                                                                      submittedReason,
                                                                              }
                                                                            : current
                                                                );
                                                            } catch (err) {
                                                                setRemarkError(
                                                                    err instanceof
                                                                        Error
                                                                        ? err.message
                                                                        : 'Could not submit remark request'
                                                                );
                                                            } finally {
                                                                setRemarkSubmitting(
                                                                    false
                                                                );
                                                            }
                                                        }}
                                                        disabled={
                                                            remarkSubmitting
                                                        }
                                                    >
                                                        {remarkSubmitting
                                                            ? 'Submitting…'
                                                            : 'Request remark'}
                                                    </Button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <p className={styles.noResult}>
                                    Results not released yet.
                                </p>
                            )}
                        </div>
                    </Card>
                ) : null}
            </div>
        </AppShell>
    );
}

export default StudentRoundDetail;
