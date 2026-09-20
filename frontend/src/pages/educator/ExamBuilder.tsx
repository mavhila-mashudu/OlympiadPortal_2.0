import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Plus,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { educatorNav } from "../../lib/mockData";
import type { Question } from "../../lib/questions";
import { QuestionCard } from "./QuestionCard";
import { QuestionForm } from "./QuestionForm";
import styles from "./ExamBuilder.module.css";

function ExamBuilder() {
  const { id: roundId } = useParams<{ id: string }>();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [examStatus, setExamStatus] = useState<string>("draft");
  const [paperUrl, setPaperUrl] = useState<string | null>(null);
  const [showPaper, setShowPaper] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchQuestions = useCallback(async () => {
    try {
      const res = await api.get<{ questions: any[] }>(
        `/rounds/${roundId}/questions`,
      );
      setQuestions(res.questions);
    } catch {
      setQuestions([]);
    }
  }, [roundId]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get<{ exam_status: string }>(
        `/rounds/${roundId}/exam-status`,
      );
      setExamStatus(res.exam_status);
    } catch {
      setExamStatus("draft");
    }
  }, [roundId]);

  // Signed viewing URL for the uploaded question paper —
  // shown side-by-side so the educator can digitize while
  // reading the original PDF
  const fetchPaperUrl = useCallback(async () => {
    try {
      const res = await api.get<{ url: string }>(
        `/papers/by-round/${roundId}?type=paper`,
      );
      setPaperUrl(res.url);
    } catch {
      setPaperUrl(null);
    }
  }, [roundId]);

  useEffect(() => {
    Promise.all([fetchQuestions(), fetchStatus(), fetchPaperUrl()]).finally(
      () => setLoading(false),
    );
  }, [fetchQuestions, fetchStatus, fetchPaperUrl]);

  const handleSave = async (data: Omit<Question, "id">) => {
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const res = await api.patch<{ question: any }>(
          `/rounds/${roundId}/questions/${editingId}`,
          data,
        );
        setQuestions((prev) =>
          prev.map((q) => (q.id === editingId ? res.question : q)),
        );
      } else {
        const res = await api.post<{ question: any }>(
          `/rounds/${roundId}/questions`,
          data,
        );
        setQuestions((prev) => [...prev, res.question]);
      }
      setShowForm(false);
      setEditingId(null);
      fetchStatus();
    } catch (err: any) {
      setError(err.message || "Failed to save question");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    setError(null);
    try {
      await api.delete(`/rounds/${roundId}/questions/${id}`);
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      fetchStatus();
    } catch (err: any) {
      setError(err.message || "Failed to delete question");
    }
  };

  const handleMarkReady = async () => {
    setError(null);
    try {
      await api.patch(`/rounds/${roundId}/exam-status`, { status: "ready" });
      setExamStatus("ready");
    } catch (err: any) {
      setError(err.message || "Failed to update status");
    }
  };

  const totalPoints = questions.reduce((sum, q) => sum + Number(q.max_points), 0);
  const isDraft = examStatus === "draft";
  const isReady = examStatus === "ready";

  if (loading) {
    return (
      <AppShell
        activeRole="educator"
        navItems={educatorNav}
        organisation=""
        portalLabel="Educator portal"
        userInitials=""
        userName=""
      >
        <p className={styles.loading}>Loading...</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      activeRole="educator"
      navItems={educatorNav}
      organisation=""
      portalLabel="Educator portal"
      userInitials=""
      userName=""
    >
      <div
        className={showPaper && paperUrl ? styles.builderLayout : styles.stack}
      >
        <div className={styles.stack}>
          <header className={styles.pageHeader}>
            <div>
              <h1>Exam Builder</h1>
              <p>
                Digitize the question paper — add each question with its type,
                options, and correct answer.
              </p>
            </div>
            <div className={styles.pageActions}>
              {paperUrl && (
                <Button
                  variant="outline"
                  onClick={() => setShowPaper((v) => !v)}
                >
                  <FileText />
                  {showPaper ? "Hide" : "Show"} question paper
                </Button>
              )}
              <Button variant="outline" to="/educator">
                <ArrowLeft /> Back to rounds
              </Button>
            </div>
          </header>

          {/* Status bar */}
          <div className={styles.statusBar}>
            <div className={styles.statsRow}>
              <span>
                <strong>{questions.length}</strong> question
                {questions.length !== 1 ? "s" : ""}
              </span>
              <span>
                <strong>{totalPoints}</strong> total point
                {totalPoints !== 1 ? "s" : ""}
              </span>
              <span className={`${styles.statusPill} ${styles[examStatus]}`}>
                {examStatus === "draft" && "Draft"}
                {examStatus === "ready" && "Ready for review"}
                {examStatus === "live" && "Live"}
              </span>
            </div>
            {isDraft && questions.length > 0 && (
              <Button size="sm" onClick={handleMarkReady}>
                <CheckCircle2 /> Mark as ready for review
              </Button>
            )}
            {isReady && (
              <span className={styles.readyNote}>
                Submitted for organiser verification. Waiting for approval.
              </span>
            )}
          </div>

          {error && <div className={styles.errorBanner}>{error}</div>}

          {/* Question list */}
          {questions.length > 0 && !showForm && (
            <div className={styles.questionList}>
              {questions.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  index={i}
                  onEdit={() => {
                    setEditingId(q.id);
                    setShowForm(true);
                  }}
                  onDelete={() => handleDelete(q.id)}
                />
              ))}
            </div>
          )}

          {/* Form */}
          {showForm && isDraft && (
            <Card className={styles.formCard}>
              <h2>{editingId ? "Edit question" : "Add a question"}</h2>
              <QuestionForm
                initial={
                  editingId
                    ? questions.find((q) => q.id === editingId)
                    : undefined
                }
                onSave={handleSave}
                onCancel={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                saving={saving}
              />
            </Card>
          )}

          {/* Add button */}
          {isDraft && !showForm && (
            <Button
              variant="outline"
              onClick={() => {
                setEditingId(null);
                setShowForm(true);
              }}
            >
              <Plus /> Add question
            </Button>
          )}

          {!isDraft && !showForm && questions.length === 0 && (
            <Card className={styles.emptyCard}>
              <p>
                No questions yet. The exam must be in draft mode to add
                questions.
              </p>
            </Card>
          )}
        </div>

        {/* Side-by-side PDF viewer — the original question paper */}
        {showPaper && paperUrl && (
          <aside className={styles.pdfPanel}>
            <div className={styles.pdfPanelHeader}>
              <FileText />
              <span>Question paper (for reference)</span>
            </div>
            <iframe
              src={paperUrl}
              title="Question paper"
              className={styles.pdfFrame}
            />
          </aside>
        )}
      </div>
    </AppShell>
  );
}

export default ExamBuilder;
