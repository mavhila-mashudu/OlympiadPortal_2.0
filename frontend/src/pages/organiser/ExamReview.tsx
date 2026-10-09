import { useCallback, useEffect, useState } from 'react';
import {
    ArrowLeft,
    CheckCircle2,
    FileText,
    Library,
    Pencil,
    RotateCcw,
    Send,
    ShieldCheck,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { organiserNav } from '../../lib/mockData';
import {
    TYPE_LABELS,
    perCorrectPoints,
    splitCorrect,
    type BankQuestion,
    type Difficulty,
    type Question,
} from '../../lib/questions';
import { CorrectAnswerEditor } from './CorrectAnswerEditor';
import styles from './ExamReview.module.css';

const dateFormatter = new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
});

const BAND_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;
type BandFilter = 'all' | keyof typeof BAND_LABELS;

// How hard a question proved, e.g. "Hard · 28% average · 43 answers".
// Nothing is shown until someone has answered it.
function DifficultyBadge({ difficulty }: { difficulty?: Difficulty }) {
    if (!difficulty || difficulty.answered === 0) return null;
    const answers = `${difficulty.answered} answer${difficulty.answered === 1 ? '' : 's'}`;
    if (difficulty.band === null || difficulty.value === null) {
        return (
            <span className={styles.difficulty}>
                Not enough answers yet · {answers}
            </span>
        );
    }
    const average = Math.round((1 - difficulty.value) * 100);
    return (
        <span
            className={`${styles.difficulty} ${styles[difficulty.band]}`}
            title="Difficulty is 1 − average score ÷ max points, over the marked answers"
        >
            {BAND_LABELS[difficulty.band]} · {average}% average · {answers}
        </span>
    );
}

function ExamReview() {
    const { id: roundId } = useParams<{ id: string }>();

    const [questions, setQuestions] = useState<Question[]>([]);
    const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([]);
    const [selectedBankQuestions, setSelectedBankQuestions] = useState<
        string[]
    >([]);
    const [bankSearch, setBankSearch] = useState('');
    const [bankBand, setBankBand] = useState<BandFilter>('all');
    const [examStatus, setExamStatus] = useState<string>('draft');
    const [questionCount, setQuestionCount] = useState(0);
    const [approvedBy, setApprovedBy] = useState<string | null>(null);
    const [approvedAt, setApprovedAt] = useState<string | null>(null);
    const [memoUrl, setMemoUrl] = useState<string | null>(null);
    const [showMemo, setShowMemo] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [correcting, setCorrecting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const [qRes, sRes] = await Promise.all([
                api.get<{ questions: any[] }>(`/rounds/${roundId}/questions`),
                api.get<{
                    exam_status: string;
                    question_count: number;
                    approved_by_name?: string | null;
                    approved_at?: string | null;
                }>(`/rounds/${roundId}/exam-status`),
            ]);
            setQuestions(qRes.questions);
            setExamStatus(sRes.exam_status);
            setQuestionCount(sRes.question_count);
            setApprovedBy(sRes.approved_by_name ?? null);
            setApprovedAt(sRes.approved_at ?? null);
            if (sRes.exam_status === 'draft') {
                // The bank is optional: if it can't load, say so, but keep the exam
                try {
                    const bank = await api.get<{ questions: BankQuestion[] }>(
                        `/rounds/${roundId}/question-bank`
                    );
                    setBankQuestions(bank.questions);
                } catch (err) {
                    setBankQuestions([]);
                    setError(
                        err instanceof Error
                            ? err.message
                            : 'Could not load the question bank'
                    );
                }
            } else {
                setBankQuestions([]);
            }
        } catch {
            setQuestions([]);
            setExamStatus('draft');
        }
    }, [roundId]);

    const handleImportQuestions = async () => {
        if (selectedBankQuestions.length === 0) return;
        setActionLoading(true);
        setError(null);
        try {
            await api.post(`/rounds/${roundId}/question-bank/import`, {
                question_ids: selectedBankQuestions,
            });
            setSelectedBankQuestions([]);
            await fetchData();
        } catch (err: any) {
            setError(err.message || 'Failed to import questions');
        } finally {
            setActionLoading(false);
        }
    };

    useEffect(() => {
        fetchData().finally(() => setLoading(false));
    }, [fetchData]);

    // Signed viewing URL for the round's memo — displayed
    // side-by-side so each digitized answer can be verified
    // against the original
    useEffect(() => {
        api.get<{ url: string }>(`/papers/by-round/${roundId}?type=memo`)
            .then((res) => setMemoUrl(res.url))
            .catch(() => setMemoUrl(null));
    }, [roundId]);

    const handleApprove = async () => {
        setActionLoading(true);
        setError(null);
        try {
            await api.patch(`/rounds/${roundId}/exam-status`, {
                status: 'live',
            });
            // Re-fetch so the audit trail (approved_by / approved_at)
            // reflects this approval
            await fetchData();
        } catch (err: any) {
            setError(err.message || 'Failed to approve');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSendBack = async () => {
        setActionLoading(true);
        setError(null);
        try {
            await api.patch(`/rounds/${roundId}/exam-status`, {
                status: 'draft',
            });
            setExamStatus('draft');
            setEditingId(null);
        } catch (err: any) {
            setError(err.message || 'Failed to send back');
        } finally {
            setActionLoading(false);
        }
    };

    // Save an organiser correction to a question's expected
    // answer (only offered while the exam is "ready")
    const handleCorrectSave = async (
        q: Question,
        data: { correct_option?: string | null; correct_answer?: string | null }
    ) => {
        setCorrecting(true);
        setError(null);
        try {
            const res = await api.patch<{ question: any }>(
                `/rounds/${roundId}/questions/${q.id}`,
                data
            );
            setQuestions((prev) =>
                prev.map((x) => (x.id === q.id ? res.question : x))
            );
            setEditingId(null);
        } catch (err: any) {
            setError(err.message || 'Failed to save correction');
        } finally {
            setCorrecting(false);
        }
    };

    const totalPoints = questions.reduce(
        (sum, q) => sum + Number(q.max_points),
        0
    );
    const filteredBank = bankQuestions.filter(
        (question) =>
            question.prompt.toLowerCase().includes(bankSearch.toLowerCase()) &&
            (bankBand === 'all' || question.difficulty?.band === bankBand)
    );
    const mcqCount = questions.filter((q) => q.type === 'mcq').length;
    const tfCount = questions.filter((q) => q.type === 'true_false').length;
    const shortCount = questions.filter(
        (q) => q.type === 'short_answer'
    ).length;
    const essayCount = questions.filter((q) => q.type === 'essay').length;
    const isReady = examStatus === 'ready';
    const isLive = examStatus === 'live';

    if (loading) {
        return (
            <AppShell
                activeRole="organiser"
                navItems={organiserNav}
                organisation=""
                portalLabel="Organiser portal"
            >
                <p className={styles.loading}>Loading...</p>
            </AppShell>
        );
    }

    return (
        <AppShell
            activeRole="organiser"
            navItems={organiserNav}
            organisation=""
            portalLabel="Organiser portal"
        >
            <div
                className={
                    showMemo && memoUrl ? styles.reviewLayout : styles.stack
                }
            >
                <div className={styles.stack}>
                    <header className={styles.pageHeader}>
                        <div>
                            <h1>Exam Review</h1>
                            <p>
                                Verify the digitized questions against the
                                original paper memo before approving for online
                                sitting.
                            </p>
                        </div>
                        <div className={styles.pageActions}>
                            {memoUrl && (
                                <Button
                                    variant="outline"
                                    onClick={() => setShowMemo((v) => !v)}
                                >
                                    <FileText />
                                    {showMemo ? 'Hide' : 'Show'} memo
                                </Button>
                            )}
                            <Button variant="outline" to="/organiser">
                                <ArrowLeft /> Dashboard
                            </Button>
                        </div>
                    </header>

                    {/* Summary + actions */}
                    <Card className={styles.summaryCard} padded={false}>
                        <div className={styles.summaryHeader}>
                            <ShieldCheck className={styles.shieldIcon} />
                            <div>
                                <h2>Verification summary</h2>
                                <p>
                                    {questionCount} question
                                    {questionCount !== 1
                                        ? 's'
                                        : ''} &middot; {totalPoints} total point
                                    {totalPoints !== 1 ? 's' : ''}
                                </p>
                            </div>
                            <span
                                className={`${styles.statusPill} ${styles[examStatus]}`}
                            >
                                {examStatus === 'draft' && 'Draft'}
                                {examStatus === 'ready' && 'Awaiting approval'}
                                {examStatus === 'live' && 'Approved — live'}
                            </span>
                        </div>

                        <div className={styles.summaryGrid}>
                            <div className={styles.summaryCell}>
                                <span className={styles.summaryValue}>
                                    {mcqCount}
                                </span>
                                <span className={styles.summaryLabel}>
                                    Multiple choice
                                </span>
                            </div>
                            <div className={styles.summaryCell}>
                                <span className={styles.summaryValue}>
                                    {tfCount}
                                </span>
                                <span className={styles.summaryLabel}>
                                    True / False
                                </span>
                            </div>
                            <div className={styles.summaryCell}>
                                <span className={styles.summaryValue}>
                                    {shortCount}
                                </span>
                                <span className={styles.summaryLabel}>
                                    Short answer
                                </span>
                            </div>
                            <div className={styles.summaryCell}>
                                <span className={styles.summaryValue}>
                                    {essayCount}
                                </span>
                                <span className={styles.summaryLabel}>
                                    Essay
                                </span>
                            </div>
                        </div>

                        {isReady && (
                            <div className={styles.actionRow}>
                                <Button
                                    onClick={handleApprove}
                                    disabled={actionLoading}
                                >
                                    <CheckCircle2 />
                                    {actionLoading
                                        ? 'Approving...'
                                        : 'Approve & go live'}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={handleSendBack}
                                    disabled={actionLoading}
                                >
                                    <RotateCcw />
                                    {actionLoading
                                        ? 'Sending back...'
                                        : 'Send back for edits'}
                                </Button>
                            </div>
                        )}

                        {isLive && (
                            <div className={styles.liveBanner}>
                                <CheckCircle2 />
                                <span>
                                    This exam has been verified and is live for
                                    online sitting. Each entrant is
                                    automatically assigned a stable shuffled
                                    question and answer-option order.
                                    {approvedBy && (
                                        <>
                                            {' '}
                                            Verified by{' '}
                                            <strong>{approvedBy}</strong>
                                            {approvedAt &&
                                                ` on ${dateFormatter.format(new Date(approvedAt))}`}
                                            .
                                        </>
                                    )}
                                </span>
                            </div>
                        )}

                        {examStatus === 'draft' && (
                            <div className={styles.draftBanner}>
                                <Send />
                                <span>
                                    Waiting for the educator to mark this exam
                                    as ready for review.
                                </span>
                            </div>
                        )}
                    </Card>

                    {error && <div className={styles.errorBanner}>{error}</div>}

                    {examStatus === 'draft' && bankQuestions.length > 0 && (
                        <Card className={styles.bankCard}>
                            <div className={styles.bankHeader}>
                                <div>
                                    <h2>
                                        <Library /> Question bank
                                    </h2>
                                    <p>
                                        Reuse questions from your previous
                                        rounds. Imported questions become
                                        editable copies in this paper.
                                    </p>
                                </div>
                                <Button
                                    onClick={handleImportQuestions}
                                    disabled={
                                        selectedBankQuestions.length === 0 ||
                                        actionLoading
                                    }
                                >
                                    {actionLoading
                                        ? 'Importing...'
                                        : `Import ${selectedBankQuestions.length || 'selected'}`}
                                </Button>
                            </div>
                            <input
                                className={styles.bankSearch}
                                value={bankSearch}
                                onChange={(event) =>
                                    setBankSearch(event.target.value)
                                }
                                placeholder="Search question bank"
                                aria-label="Search question bank"
                            />
                            <div
                                className={styles.bandFilter}
                                role="group"
                                aria-label="Filter by difficulty"
                            >
                                {(
                                    ['all', 'easy', 'medium', 'hard'] as const
                                ).map((band) => (
                                    <button
                                        key={band}
                                        type="button"
                                        className={styles.bandButton}
                                        aria-pressed={bankBand === band}
                                        onClick={() => setBankBand(band)}
                                    >
                                        {band === 'all'
                                            ? 'All'
                                            : BAND_LABELS[band]}
                                    </button>
                                ))}
                            </div>
                            <div className={styles.bankList}>
                                {filteredBank.length === 0 && (
                                    <p className={styles.bankEmpty}>
                                        No questions match.
                                    </p>
                                )}
                                {filteredBank.map((question) => {
                                    const rounds =
                                        question.used_in?.length ?? 1;
                                    return (
                                        <label
                                            key={question.id}
                                            className={styles.bankItem}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedBankQuestions.includes(
                                                    question.id
                                                )}
                                                onChange={() =>
                                                    setSelectedBankQuestions(
                                                        (current) =>
                                                            current.includes(
                                                                question.id
                                                            )
                                                                ? current.filter(
                                                                      (id) =>
                                                                          id !==
                                                                          question.id
                                                                  )
                                                                : [
                                                                      ...current,
                                                                      question.id,
                                                                  ]
                                                    )
                                                }
                                            />
                                            <span>
                                                <strong>
                                                    {question.prompt}
                                                </strong>
                                                <small>
                                                    {TYPE_LABELS[question.type]}{' '}
                                                    ·{' '}
                                                    {question.source_round.name}
                                                    {rounds > 1 &&
                                                        ` · used in ${rounds} rounds`}
                                                </small>
                                                <DifficultyBadge
                                                    difficulty={
                                                        question.difficulty
                                                    }
                                                />
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </Card>
                    )}

                    {/* Questions */}
                    {questions.length > 0 && (
                        <div className={styles.questionList}>
                            {questions.map((q, i) => (
                                <div key={q.id} className={styles.questionCard}>
                                    <div className={styles.questionHeader}>
                                        <span className={styles.questionNumber}>
                                            Q{i + 1}
                                        </span>
                                        <span className={styles.typeBadge}>
                                            {TYPE_LABELS[q.type]}
                                            {q.type === 'mcq' &&
                                            splitCorrect(q.correct_option)
                                                .length > 1
                                                ? ' (multiple answers)'
                                                : ''}
                                        </span>
                                        <DifficultyBadge
                                            difficulty={q.difficulty}
                                        />
                                        <span className={styles.points}>
                                            {Number(q.max_points)} pt
                                            {Number(q.max_points) !== 1
                                                ? 's'
                                                : ''}
                                        </span>
                                        {isReady && (
                                            <div
                                                className={
                                                    styles.questionActions
                                                }
                                            >
                                                <button
                                                    type="button"
                                                    className={styles.iconBtn}
                                                    onClick={() =>
                                                        setEditingId(
                                                            editingId === q.id
                                                                ? null
                                                                : q.id
                                                        )
                                                    }
                                                    title="Correct answer"
                                                >
                                                    <Pencil />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <p className={styles.questionPrompt}>
                                        {q.prompt}
                                    </p>

                                    {(q.type === 'mcq' ||
                                        q.type === 'true_false') &&
                                        q.options && (
                                            <ul className={styles.optionsList}>
                                                {q.options.map((opt, idx) => (
                                                    <li
                                                        key={idx}
                                                        className={`${styles.optionItem} ${splitCorrect(q.correct_option).includes(String(idx)) ? styles.correctOption : ''}`}
                                                    >
                                                        <span
                                                            className={
                                                                styles.optionLetter
                                                            }
                                                        >
                                                            {String.fromCharCode(
                                                                65 + idx
                                                            )}
                                                            .
                                                        </span>
                                                        {opt}
                                                        {splitCorrect(
                                                            q.correct_option
                                                        ).includes(
                                                            String(idx)
                                                        ) && (
                                                            <CheckCircle2
                                                                className={
                                                                    styles.checkIcon
                                                                }
                                                            />
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}

                                    {q.type === 'mcq' &&
                                        splitCorrect(q.correct_option).length >
                                            1 && (
                                            <p className={styles.essayNote}>
                                                Points split evenly across{' '}
                                                {
                                                    splitCorrect(
                                                        q.correct_option
                                                    ).length
                                                }{' '}
                                                correct answers (
                                                {perCorrectPoints(q)} each).
                                            </p>
                                        )}

                                    {q.type === 'mcq' &&
                                        Number(q.negative_pct) > 0 && (
                                            <p className={styles.essayNote}>
                                                Negative marking:{' '}
                                                {Number(q.negative_pct)}% of the
                                                question&apos;s points deducted
                                                per wrong selection.
                                            </p>
                                        )}

                                    {q.type === 'short_answer' &&
                                        q.correct_answer && (
                                            <div className={styles.answerBox}>
                                                <span
                                                    className={
                                                        styles.answerLabel
                                                    }
                                                >
                                                    Expected answer:
                                                </span>
                                                <strong>
                                                    {q.correct_answer}
                                                </strong>
                                            </div>
                                        )}

                                    {q.type === 'essay' && (
                                        <div className={styles.essayNote}>
                                            This question will be queued for
                                            manual marking after submission.
                                        </div>
                                    )}

                                    {isReady && editingId === q.id && (
                                        <CorrectAnswerEditor
                                            question={q}
                                            onSave={(data) =>
                                                handleCorrectSave(q, data)
                                            }
                                            onCancel={() => setEditingId(null)}
                                            saving={correcting}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {questions.length === 0 && (
                        <Card className={styles.emptyCard}>
                            <p>
                                No questions have been added to this exam yet.
                            </p>
                        </Card>
                    )}
                </div>

                {/* Side-by-side PDF viewer — the original memo */}
                {showMemo && memoUrl && (
                    <aside className={styles.pdfPanel}>
                        <div className={styles.pdfPanelHeader}>
                            <FileText />
                            <span>Memo (for verification)</span>
                        </div>
                        <iframe
                            src={memoUrl}
                            title="Memo"
                            className={styles.pdfFrame}
                        />
                    </aside>
                )}
            </div>
        </AppShell>
    );
}

export default ExamReview;
