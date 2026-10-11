import { useEffect, useState } from 'react';
import {
    CheckCircle2,
    AlertCircle,
    X,
    FileText,
    Check,
    Save,
} from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TablePanel, Td, Th } from '../../components/ui/Table';
import { api } from '../../lib/api';
import { educatorNav } from '../../lib/mockData';
import styles from './Remarks.module.css';

type RemarkStatus = 'pending' | 'reviewed';

type RemarkRow = {
    id: string;
    resultId: string;
    studentName: string;
    studentSchool: string;
    roundName: string;
    olympiadName: string;
    score: number;
    reason: string;
    status: RemarkStatus;
    review_note: string | null;
    created_at: string;
    reviewed_at: string | null;
};

type RemarkAnswer = {
    id: string;
    questionId: string;
    prompt: string;
    type: string;
    options: string[] | null;
    correctOption: number | null;
    correctAnswer: string | null;
    maxPoints: number;
    studentAnswer: string | null;
    pointsAwarded: number | null;
    isCorrect: boolean | null;
    markedAt: string | null;
};

type RemarkAnswersResponse = {
    remarkId: string;
    submissionId: string | null;
    studentName: string;
    roundName: string;
    totalPoints: number;
    answers: RemarkAnswer[];
};

const statusLabels: Record<RemarkStatus, string> = {
    pending: 'Pending review',
    reviewed: 'Reviewed',
};

export function EducatorRemarks() {
    const [remarks, setRemarks] = useState<RemarkRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Modal inspection & re-marking state
    const [activeRemark, setActiveRemark] = useState<RemarkRow | null>(null);
    const [answers, setAnswers] = useState<RemarkAnswer[]>([]);
    const [loadingAnswers, setLoadingAnswers] = useState(false);
    const [modalTotalPoints, setModalTotalPoints] = useState<number>(0);
    const [pointsDrafts, setPointsDrafts] = useState<Record<string, number>>(
        {}
    );
    const [savingAnswerId, setSavingAnswerId] = useState<string | null>(null);
    const [savedSuccessMap, setSavedSuccessMap] = useState<
        Record<string, boolean>
    >({});
    const [reviewNoteDraft, setReviewNoteDraft] = useState<string>('');
    const [resolvingRemark, setResolvingRemark] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);

    const loadRemarks = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.get<{ remarks: RemarkRow[] }>(
                '/me/assigned-remarks'
            );
            setRemarks(data.remarks || []);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to load assigned remarks'
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadRemarks();
    }, []);

    const openRemarkModal = async (remark: RemarkRow) => {
        setActiveRemark(remark);
        setReviewNoteDraft(remark.review_note || '');
        setModalTotalPoints(remark.score);
        setModalError(null);
        setLoadingAnswers(true);

        try {
            const data = await api.get<RemarkAnswersResponse>(
                `/remarks/${remark.id}/answers`
            );
            setAnswers(data.answers || []);
            setModalTotalPoints(data.totalPoints ?? remark.score);
            const drafts: Record<string, number> = {};
            for (const a of data.answers || []) {
                drafts[a.id] = a.pointsAwarded ?? 0;
            }
            setPointsDrafts(drafts);
        } catch (err) {
            setModalError(
                err instanceof Error
                    ? err.message
                    : 'Failed to load submission questions'
            );
        } finally {
            setLoadingAnswers(false);
        }
    };

    const closeRemarkModal = () => {
        setActiveRemark(null);
        setAnswers([]);
        setSavedSuccessMap({});
        setModalError(null);
    };

    const handleSaveQuestionMark = async (answer: RemarkAnswer) => {
        if (!activeRemark) return;
        setSavingAnswerId(answer.id);
        setModalError(null);

        const awarded = Number(pointsDrafts[answer.id] ?? 0);

        try {
            const res = await api.patch<{
                answerId: string;
                pointsAwarded: number;
                isCorrect: boolean;
                totalPoints: number;
            }>(`/remarks/${activeRemark.id}/answers/${answer.id}`, {
                points_awarded: awarded,
            });

            // Update local answers
            setAnswers((prev) =>
                prev.map((a) =>
                    a.id === answer.id
                        ? {
                              ...a,
                              pointsAwarded: res.pointsAwarded,
                              isCorrect: res.isCorrect,
                          }
                        : a
                )
            );
            setModalTotalPoints(res.totalPoints);

            // Update table row total score
            setRemarks((prev) =>
                prev.map((r) =>
                    r.id === activeRemark.id
                        ? { ...r, score: res.totalPoints }
                        : r
                )
            );

            // Flash saved check
            setSavedSuccessMap((prev) => ({ ...prev, [answer.id]: true }));
            setTimeout(() => {
                setSavedSuccessMap((prev) => ({ ...prev, [answer.id]: false }));
            }, 2500);
        } catch (err) {
            setModalError(
                err instanceof Error ? err.message : 'Failed to update mark'
            );
        } finally {
            setSavingAnswerId(null);
        }
    };

    const handleCompleteReview = async () => {
        if (!activeRemark) return;
        setResolvingRemark(true);
        setModalError(null);

        try {
            const note = reviewNoteDraft.trim();
            await api.post(`/remarks/${activeRemark.id}/review`, {
                status: 'reviewed',
                review_note: note || null,
            });

            setRemarks((prev) =>
                prev.map((r) =>
                    r.id === activeRemark.id
                        ? {
                              ...r,
                              status: 'reviewed',
                              review_note: note || null,
                              reviewed_at: new Date().toISOString(),
                          }
                        : r
                )
            );

            setActiveRemark((prev) =>
                prev
                    ? {
                          ...prev,
                          status: 'reviewed',
                          review_note: note || null,
                          reviewed_at: new Date().toISOString(),
                      }
                    : null
            );

            setSuccessMsg(
                `Remark for ${activeRemark.studentName} has been reviewed and saved.`
            );
            closeRemarkModal();
        } catch (err) {
            setModalError(
                err instanceof Error
                    ? err.message
                    : 'Failed to mark as reviewed'
            );
        } finally {
            setResolvingRemark(false);
        }
    };

    return (
        <AppShell
            activeRole="educator"
            navItems={educatorNav}
            organisation="Your School"
            portalLabel="Educator Portal"
        >
            <div className={styles.stack}>
                <PageHeader
                    title="Remark Requests"
                    description="Inspect and re-mark student appeals assigned to you by the Olympiad organiser."
                />

                {error && (
                    <Card>
                        <p className={styles.error} role="alert">
                            <AlertCircle
                                size={16}
                                style={{
                                    display: 'inline',
                                    verticalAlign: 'text-bottom',
                                    marginRight: 6,
                                }}
                            />
                            {error}
                        </p>
                    </Card>
                )}

                {successMsg && (
                    <Card>
                        <p
                            style={{
                                color: 'var(--primary)',
                                padding: '0.875rem 1rem',
                            }}
                            role="status"
                        >
                            <CheckCircle2
                                size={16}
                                style={{
                                    display: 'inline',
                                    verticalAlign: 'text-bottom',
                                    marginRight: 6,
                                }}
                            />
                            {successMsg}
                        </p>
                    </Card>
                )}

                {loading ? (
                    <Card>
                        <p className={styles.empty}>
                            Loading assigned remarks…
                        </p>
                    </Card>
                ) : remarks.length === 0 ? (
                    <Card>
                        <p className={styles.empty}>
                            No remark requests have been assigned to you yet.
                        </p>
                    </Card>
                ) : (
                    <TablePanel minWidth="64rem">
                        <thead>
                            <tr>
                                <Th>Student</Th>
                                <Th>Round</Th>
                                <Th numeric>Score</Th>
                                <Th>Student's Reason</Th>
                                <Th>Status</Th>
                                <Th>Review Feedback</Th>
                                <Th>Action</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {remarks.map((remark) => (
                                <tr key={remark.id}>
                                    <Td strong muted={false}>
                                        <div>{remark.studentName}</div>
                                        <div className={styles.metaSubtext}>
                                            {remark.studentSchool}
                                        </div>
                                    </Td>
                                    <Td muted={false}>
                                        <div>{remark.roundName}</div>
                                        <div className={styles.metaSubtext}>
                                            {remark.olympiadName}
                                        </div>
                                    </Td>
                                    <Td numeric muted={false}>
                                        {remark.score}
                                    </Td>
                                    <Td muted={false}>
                                        <div className={styles.reasonCell}>
                                            {remark.reason}
                                        </div>
                                    </Td>
                                    <Td muted={false}>
                                        <span
                                            className={`${styles.statusBadge} ${styles[remark.status]}`}
                                        >
                                            {statusLabels[remark.status]}
                                        </span>
                                    </Td>
                                    <Td muted={false}>
                                        <div className={styles.reasonCell}>
                                            {remark.review_note ? (
                                                remark.review_note
                                            ) : (
                                                <span
                                                    className={
                                                        styles.metaSubtext
                                                    }
                                                >
                                                    No note recorded
                                                </span>
                                            )}
                                        </div>
                                    </Td>
                                    <Td muted={false}>
                                        <div className={styles.tableActions}>
                                            <Button
                                                size="sm"
                                                variant={
                                                    remark.status === 'reviewed'
                                                        ? 'outline'
                                                        : 'primary'
                                                }
                                                icon={<FileText size={14} />}
                                                onClick={() =>
                                                    openRemarkModal(remark)
                                                }
                                            >
                                                {remark.status === 'reviewed'
                                                    ? 'Inspect Answers'
                                                    : 'Re-mark Answers'}
                                            </Button>
                                        </div>
                                    </Td>
                                </tr>
                            ))}
                        </tbody>
                    </TablePanel>
                )}
            </div>

            {/* Modal for Question-by-Question Re-marking */}
            {activeRemark && (
                <div
                    className={styles.modalBackdrop}
                    role="dialog"
                    aria-modal="true"
                >
                    <div className={styles.modalContent}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 className={styles.modalTitle}>
                                    {activeRemark.status === 'reviewed'
                                        ? 'Submission Review'
                                        : 'Re-mark Student Submission'}
                                </h2>
                                <div className={styles.modalSubtitle}>
                                    {activeRemark.studentName} •{' '}
                                    {activeRemark.roundName} (
                                    {activeRemark.olympiadName})
                                </div>
                            </div>
                            <button
                                type="button"
                                className={styles.closeButton}
                                onClick={closeRemarkModal}
                                aria-label="Close modal"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            {modalError && (
                                <div className={styles.error} role="alert">
                                    <AlertCircle
                                        size={16}
                                        style={{
                                            display: 'inline',
                                            verticalAlign: 'text-bottom',
                                            marginRight: 6,
                                        }}
                                    />
                                    {modalError}
                                </div>
                            )}

                            {/* Student's Reason for appeal */}
                            <div className={styles.appealCard}>
                                <div className={styles.appealTitle}>
                                    Student's Reason for Appeal
                                </div>
                                <div className={styles.appealReason}>
                                    {activeRemark.reason}
                                </div>
                            </div>

                            {/* Score Banner */}
                            <div className={styles.scoreBanner}>
                                <span className={styles.scoreLabel}>
                                    Current Calculated Score
                                </span>
                                <span className={styles.scoreValue}>
                                    {modalTotalPoints} points
                                </span>
                            </div>

                            {/* Questions List */}
                            {loadingAnswers ? (
                                <p className={styles.empty}>
                                    Loading question responses…
                                </p>
                            ) : answers.length === 0 ? (
                                <p className={styles.empty}>
                                    No question responses found for this
                                    submission.
                                </p>
                            ) : (
                                answers.map((answer, index) => {
                                    const isReviewed =
                                        activeRemark.status === 'reviewed';
                                    const maxPts = answer.maxPoints;
                                    const currentDraft =
                                        pointsDrafts[answer.id] ?? 0;
                                    const isSavingThis =
                                        savingAnswerId === answer.id;
                                    const isSavedThis =
                                        savedSuccessMap[answer.id];

                                    return (
                                        <div
                                            key={answer.id}
                                            className={styles.questionCard}
                                        >
                                            <div
                                                className={
                                                    styles.questionHeader
                                                }
                                            >
                                                <span
                                                    style={{
                                                        fontWeight: 600,
                                                        fontSize: '0.875rem',
                                                    }}
                                                >
                                                    Question {index + 1}
                                                </span>
                                                <span
                                                    className={
                                                        styles.metaSubtext
                                                    }
                                                >
                                                    Max Points: {maxPts}
                                                </span>
                                            </div>

                                            <div
                                                className={
                                                    styles.questionPrompt
                                                }
                                            >
                                                {answer.prompt}
                                            </div>

                                            <div
                                                className={
                                                    styles.answerComparison
                                                }
                                            >
                                                <div>
                                                    <div
                                                        className={
                                                            styles.answerBoxTitle
                                                        }
                                                    >
                                                        Student's Submitted
                                                        Answer
                                                    </div>
                                                    <div
                                                        className={
                                                            styles.answerBoxValue
                                                        }
                                                    >
                                                        {answer.studentAnswer ??
                                                            '(No answer provided)'}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div
                                                        className={
                                                            styles.answerBoxTitle
                                                        }
                                                    >
                                                        Correct Answer / Memo
                                                    </div>
                                                    <div
                                                        className={
                                                            styles.answerBoxValue
                                                        }
                                                    >
                                                        {answer.correctAnswer ||
                                                            (answer.correctOption !==
                                                            null
                                                                ? `Option ${answer.correctOption}`
                                                                : '(Memo not set)')}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className={styles.markingRow}>
                                                <label
                                                    htmlFor={`pts-${answer.id}`}
                                                    style={{
                                                        fontSize: '0.875rem',
                                                        fontWeight: 500,
                                                    }}
                                                >
                                                    Points Awarded:
                                                </label>
                                                <input
                                                    id={`pts-${answer.id}`}
                                                    type="number"
                                                    className={
                                                        styles.pointsInput
                                                    }
                                                    min={0}
                                                    max={maxPts}
                                                    step={1}
                                                    disabled={
                                                        isReviewed ||
                                                        isSavingThis
                                                    }
                                                    value={currentDraft}
                                                    onChange={(e) => {
                                                        const val = Math.max(
                                                            0,
                                                            Math.min(
                                                                maxPts,
                                                                Number(
                                                                    e.target
                                                                        .value
                                                                ) || 0
                                                            )
                                                        );
                                                        setPointsDrafts(
                                                            (prev) => ({
                                                                ...prev,
                                                                [answer.id]:
                                                                    val,
                                                            })
                                                        );
                                                    }}
                                                />
                                                <span
                                                    style={{
                                                        fontSize: '0.85rem',
                                                        color: 'var(--muted-foreground)',
                                                    }}
                                                >
                                                    / {maxPts}
                                                </span>

                                                {!isReviewed && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        icon={
                                                            isSavedThis ? (
                                                                <Check
                                                                    size={14}
                                                                    color="var(--primary)"
                                                                />
                                                            ) : (
                                                                <Save
                                                                    size={14}
                                                                />
                                                            )
                                                        }
                                                        disabled={isSavingThis}
                                                        onClick={() =>
                                                            handleSaveQuestionMark(
                                                                answer
                                                            )
                                                        }
                                                    >
                                                        {isSavingThis
                                                            ? 'Saving…'
                                                            : isSavedThis
                                                              ? 'Saved'
                                                              : 'Save Mark'}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}

                            {/* Review Note & Feedback */}
                            <div className={styles.reviewFeedbackSection}>
                                <label
                                    htmlFor="review-feedback"
                                    style={{
                                        fontSize: '0.875rem',
                                        fontWeight: 600,
                                    }}
                                >
                                    Educator Review Feedback
                                </label>
                                <textarea
                                    id="review-feedback"
                                    className={styles.noteField}
                                    rows={3}
                                    disabled={
                                        activeRemark.status === 'reviewed' ||
                                        resolvingRemark
                                    }
                                    value={reviewNoteDraft}
                                    onChange={(e) =>
                                        setReviewNoteDraft(e.target.value)
                                    }
                                    placeholder="Provide an explanation for the student regarding any adjustments or clarifications..."
                                />
                            </div>
                        </div>

                        <div className={styles.modalFooter}>
                            <Button
                                variant="outline"
                                onClick={closeRemarkModal}
                            >
                                {activeRemark.status === 'reviewed'
                                    ? 'Close'
                                    : 'Cancel'}
                            </Button>
                            {activeRemark.status !== 'reviewed' && (
                                <Button
                                    variant="primary"
                                    icon={<CheckCircle2 size={16} />}
                                    disabled={resolvingRemark}
                                    onClick={handleCompleteReview}
                                >
                                    {resolvingRemark
                                        ? 'Finalizing…'
                                        : 'Complete Review'}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}

export default EducatorRemarks;
