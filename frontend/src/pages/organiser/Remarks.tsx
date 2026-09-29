import { useEffect, useState, useMemo } from "react";
import { Sparkles, Check, UserCheck, AlertCircle } from "lucide-react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { TablePanel, Td, Th } from "../../components/ui/Table";
import { api } from "../../lib/api";
import { organiserNav } from "../../lib/mockData";
import styles from "./Remarks.module.css";

type RemarkItem = {
  id: string;
  resultId: string;
  studentName: string;
  schoolId: string | null;
  schoolName: string;
  roundId: string;
  roundName: string;
  olympiadId: string;
  olympiadName: string;
  score: number;
  reason: string;
  status: "pending" | "reviewed";
  reviewerId: string | null;
  reviewerName: string | null;
  reviewerSchool: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

type EligibleEducator = {
  id: string;
  userId: string;
  name: string;
  email: string;
  schoolId: string;
  schoolName: string;
  pendingCount: number;
};

type StatusFilter = "all" | "unassigned" | "assigned" | "reviewed";

export function OrganiserRemarks() {
  const [remarks, setRemarks] = useState<RemarkItem[]>([]);
  const [educatorsByRound, setEducatorsByRound] = useState<Record<string, EligibleEducator[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectedReviewers, setSelectedReviewers] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [autoAssigning, setAutoAssigning] = useState(false);

  const fetchRemarks = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ remarks: RemarkItem[] }>("/organiser/remarks");
      setRemarks(data.remarks || []);

      // Gather unique round IDs to prefetch eligible educators
      const roundIds = [...new Set((data.remarks || []).map((r) => r.roundId).filter(Boolean))];
      await fetchEducatorsForRounds(roundIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load remark requests");
    } finally {
      setLoading(false);
    }
  };

  const fetchEducatorsForRounds = async (roundIds: string[]) => {
    const mapping: Record<string, EligibleEducator[]> = {};
    for (const roundId of roundIds) {
      try {
        const data = await api.get<{ educators: EligibleEducator[] }>(
          `/organiser/remarks/rounds/${roundId}/educators`
        );
        mapping[roundId] = data.educators || [];
      } catch (err) {
        console.warn(`Could not load educators for round ${roundId}:`, err);
      }
    }
    setEducatorsByRound(mapping);
  };

  useEffect(() => {
    void fetchRemarks();
  }, []);

  const handleManualAssign = async (remarkId: string, roundId: string) => {
    const reviewerId = selectedReviewers[remarkId];
    if (!reviewerId) return;

    setAssigningId(remarkId);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await api.patch<{ remark: { reviewer_id: string } }>(
        `/organiser/remarks/${remarkId}/assign`,
        { reviewerId }
      );

      const educators = educatorsByRound[roundId] || [];
      const assignedEdu = educators.find((e) => e.userId === res.remark.reviewer_id);

      setRemarks((prev) =>
        prev.map((r) =>
          r.id === remarkId
            ? {
                ...r,
                reviewerId: res.remark.reviewer_id,
                reviewerName: assignedEdu?.name || "Assigned Educator",
                reviewerSchool: assignedEdu?.schoolName || "School",
              }
            : r
        )
      );
      setSuccessMsg(`Remark successfully assigned to ${assignedEdu?.name || "educator"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign remark");
    } finally {
      setAssigningId(null);
    }
  };

  const handleAutoAssign = async () => {
    const unassignedRounds = [
      ...new Set(
        remarks
          .filter((r) => r.status === "pending" && !r.reviewerId && r.roundId)
          .map((r) => r.roundId)
      ),
    ];

    if (unassignedRounds.length === 0) {
      setError("No unassigned remarks available for auto-assignment.");
      return;
    }

    setAutoAssigning(true);
    setError(null);
    setSuccessMsg(null);

    try {
      let totalAssigned = 0;
      let totalSkipped = 0;
      for (const roundId of unassignedRounds) {
        const res = await api.post<{ assignedCount: number; skippedCount?: number }>(
          `/organiser/remarks/rounds/${roundId}/auto-assign`
        );
        totalAssigned += res.assignedCount || 0;
        totalSkipped += res.skippedCount || 0;
      }
      setSuccessMsg(
        `Successfully auto-assigned ${totalAssigned} remark request(s) evenly across educators.` +
          (totalSkipped
            ? ` ${totalSkipped} could not be assigned: there is no educator from another school to review them.`
            : "")
      );
      await fetchRemarks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-assignment failed");
    } finally {
      setAutoAssigning(false);
    }
  };

  const filteredRemarks = useMemo(() => {
    return remarks.filter((r) => {
      if (filter === "unassigned") return r.status === "pending" && !r.reviewerId;
      if (filter === "assigned") return r.status === "pending" && Boolean(r.reviewerId);
      if (filter === "reviewed") return r.status === "reviewed";
      return true;
    });
  }, [remarks, filter]);

  const unassignedCount = useMemo(() => {
    return remarks.filter((r) => r.status === "pending" && !r.reviewerId).length;
  }, [remarks]);

  return (
    <AppShell
      activeRole="organiser"
      navItems={organiserNav}
      organisation="Olympiad Organiser"
      portalLabel="Organiser Portal"
    >
      <div className={styles.stack}>
        <PageHeader
          title="Remark Requests"
          description="Review student remark requests and assign them manually or auto-split them evenly across participating educators."
        />

        {error && (
          <Card>
            <p className={styles.errorBanner} role="alert">
              <AlertCircle size={16} style={{ display: "inline", verticalAlign: "text-bottom", marginRight: 6 }} />
              {error}
            </p>
          </Card>
        )}

        {successMsg && (
          <Card>
            <p className={styles.successBanner} role="status">
              <Check size={16} style={{ display: "inline", verticalAlign: "text-bottom", marginRight: 6 }} />
              {successMsg}
            </p>
          </Card>
        )}

        <div className={styles.actionBar}>
          <div className={styles.filterGroup}>
            <button
              type="button"
              className={`${styles.filterBtn} ${filter === "all" ? styles.activeFilter : ""}`}
              onClick={() => setFilter("all")}
            >
              All ({remarks.length})
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${filter === "unassigned" ? styles.activeFilter : ""}`}
              onClick={() => setFilter("unassigned")}
            >
              Unassigned ({unassignedCount})
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${filter === "assigned" ? styles.activeFilter : ""}`}
              onClick={() => setFilter("assigned")}
            >
              Assigned ({remarks.filter((r) => r.status === "pending" && Boolean(r.reviewerId)).length})
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${filter === "reviewed" ? styles.activeFilter : ""}`}
              onClick={() => setFilter("reviewed")}
            >
              Reviewed ({remarks.filter((r) => r.status === "reviewed").length})
            </button>
          </div>

          <Button
            variant="primary"
            icon={<Sparkles size={16} />}
            disabled={unassignedCount === 0 || autoAssigning}
            onClick={handleAutoAssign}
          >
            {autoAssigning ? "Distributing…" : `Auto-assign unassigned (${unassignedCount})`}
          </Button>
        </div>

        {loading ? (
          <Card>
            <p className={styles.emptyState}>Loading remark requests…</p>
          </Card>
        ) : filteredRemarks.length === 0 ? (
          <Card>
            <p className={styles.emptyState}>No remark requests matching this filter.</p>
          </Card>
        ) : (
          <TablePanel minWidth="64rem">
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Round</Th>
                <Th numeric>Score</Th>
                <Th>Reason</Th>
                <Th>Status</Th>
                <Th>Assigned Reviewer</Th>
                <Th>Assignment Action</Th>
              </tr>
            </thead>
            <tbody>
              {filteredRemarks.map((remark) => {
                // No one reviews a learner from their own school
                const educators = (educatorsByRound[remark.roundId] || []).filter(
                  (e) => e.schoolId !== remark.schoolId
                );
                const isReviewed = remark.status === "reviewed";
                const isAssigned = Boolean(remark.reviewerId);

                return (
                  <tr key={remark.id}>
                    <Td strong muted={false}>
                      <div>{remark.studentName}</div>
                      <div className={styles.metaSubtext}>{remark.schoolName}</div>
                    </Td>
                    <Td muted={false}>
                      <div>{remark.roundName}</div>
                      <div className={styles.metaSubtext}>{remark.olympiadName}</div>
                    </Td>
                    <Td numeric muted={false}>
                      {remark.score}
                    </Td>
                    <Td muted={false}>
                      <div className={styles.reasonCell}>{remark.reason}</div>
                    </Td>
                    <Td muted={false}>
                      {isReviewed ? (
                        <span className={`${styles.statusBadge} ${styles.statusReviewed}`}>Reviewed</span>
                      ) : isAssigned ? (
                        <span className={`${styles.statusBadge} ${styles.statusAssigned}`}>Assigned</span>
                      ) : (
                        <span className={`${styles.statusBadge} ${styles.statusUnassigned}`}>Unassigned</span>
                      )}
                    </Td>
                    <Td muted={false}>
                      {remark.reviewerName ? (
                        <div>
                          <div>{remark.reviewerName}</div>
                          <div className={styles.metaSubtext}>{remark.reviewerSchool}</div>
                        </div>
                      ) : (
                        <span className={styles.metaSubtext}>None assigned</span>
                      )}
                    </Td>
                    <Td muted={false}>
                      {isReviewed ? (
                        <span className={styles.metaSubtext}>Complete</span>
                      ) : (
                        <div className={styles.actionCell}>
                          <select
                            className={styles.reviewerSelect}
                            value={selectedReviewers[remark.id] ?? remark.reviewerId ?? ""}
                            onChange={(e) =>
                              setSelectedReviewers((prev) => ({
                                ...prev,
                                [remark.id]: e.target.value,
                              }))
                            }
                            disabled={assigningId === remark.id}
                            aria-label={`Select reviewer for ${remark.studentName}`}
                          >
                            <option value="">Choose educator…</option>
                            {educators.map((edu) => (
                              <option key={edu.userId} value={edu.userId}>
                                {edu.name} ({edu.schoolName} - {edu.pendingCount} pending)
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<UserCheck size={14} />}
                            disabled={
                              assigningId === remark.id ||
                              !selectedReviewers[remark.id] ||
                              selectedReviewers[remark.id] === remark.reviewerId
                            }
                            onClick={() => handleManualAssign(remark.id, remark.roundId)}
                          >
                            {assigningId === remark.id ? "Saving…" : "Assign"}
                          </Button>
                        </div>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TablePanel>
        )}
      </div>
    </AppShell>
  );
}

export default OrganiserRemarks;
