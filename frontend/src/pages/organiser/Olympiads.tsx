import { ChevronRight } from "lucide-react";
import React, { Fragment, useEffect, useState } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ErrorAlert } from "../../components/ui/Feedback";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Select } from "../../components/ui/Select";
import { api } from "../../lib/api";
import { clearCurrentOlympiadCache } from "../../lib/olympiad";
import { DEFAULT_TIMEZONE, TIMEZONE_OPTIONS, formatDateInZone } from "../../lib/time";
import { organiserNav } from "../../lib/mockData";
import { InviteEducatorDialog, InviteEducatorForm } from "./InviteEducatorForm";
import styles from "./Olympiads.module.css";

const roundStateClasses: Record<string, string | undefined> = {
  open: styles.stateOpen,
  closed: styles.stateClosed,
  marking: styles.stateMarking,
  results_released: styles.stateReleased,
};

export default function Olympiads() {
  const [olympiads, setOlympiads] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteOlympiadId, setInviteOlympiadId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [loadingRounds, setLoadingRounds] = useState(false);

  async function loadRounds(olympiadId: string) {
    setLoadingRounds(true);
    try {
      const res: any = await api.get(`/olympiads/${olympiadId}/rounds`);
      setRounds(res.rounds || res || []);
    } catch {
      setRounds([]);
    } finally {
      setLoadingRounds(false);
    }
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setRounds([]);
    } else {
      setExpandedId(id);
      loadRounds(id);
    }
  }

  async function loadOlympiads() {
    try {
      const res: any = await api.get("/olympiads");
      const list = res.olympiads || res || [];
      setOlympiads(list);
    } catch (err: any) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadOlympiads();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/olympiads", { name, timezone });
      clearCurrentOlympiadCache();
      setName("");
      setTimezone(DEFAULT_TIMEZONE);
      await loadOlympiads();
    } catch (err: any) {
      setError(err.message || "Failed to create Olympiad.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOlympiad = async (id: string) => {
    try {
      await api.delete(`/olympiads/${id}`);
      clearCurrentOlympiadCache();
      setDeletingId(null);
      await loadOlympiads();
    } catch (err: any) {
      setError(err.message || "Failed to delete olympiad.");
    }
  };

  return (
    <AppShell
      activeRole="organiser"
      navItems={organiserNav}
      organisation="National Olympiad Office"
      portalLabel="Organiser console"
      userInitials="NO"
      userName="Admin user"
    >
      <div className={styles.stack}>
        <PageHeader
          title="Olympiads"
          description="Manage and create competition editions."
        />

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        <Card className={styles.createCard}>
          <form className={styles.createForm} onSubmit={handleCreate}>
            <h2 className={styles.sectionTitle}>Create new olympiad</h2>
            <div className={styles.createGrid}>
              <div className={styles.field}>
                <Label htmlFor="olympiad-name">
                  Name <span className={styles.required}>*</span>
                </Label>
                <Input
                  id="olympiad-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. 2026 National Competition"
                  required
                />
              </div>
              <div className={styles.field}>
                <Label htmlFor="olympiad-timezone">Timezone</Label>
                <Select id="olympiad-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {TIMEZONE_OPTIONS.map((zone) => (
                    <option key={zone.value} value={zone.value}>
                      {zone.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Button className={styles.createButton} type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create"}
              </Button>
            </div>
            <p className={styles.hint}>
              Round times are entered and shown in this timezone, so every school sees the same official times.
            </p>
          </form>
        </Card>

        <Card padded={false} className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2>Registered olympiads</h2>
          </div>
          <div className={styles.tableScroller}>
            <table className={styles.olympiadsTable}>
              <thead>
                <tr>
                  <th>Olympiad Name</th>
                  <th>ID</th>
                  <th className={styles.numeric}>Rounds</th>
                  <th className={styles.numeric}>Schools Registered</th>
                  <th className={styles.actionColumn}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {olympiads.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={5}>
                      No olympiads registered yet.
                    </td>
                  </tr>
                ) : (
                  olympiads.map((item) => (
                    <Fragment key={item.id}>
                      <tr>
                        <td>
                          <button
                            aria-expanded={expandedId === item.id}
                            className={styles.expandButton}
                            onClick={() => toggleExpand(item.id)}
                            type="button"
                          >
                            <ChevronRight
                              aria-hidden="true"
                              className={`${styles.chevron} ${expandedId === item.id ? styles.chevronOpen : ""}`}
                            />
                            {item.name}
                          </button>
                        </td>
                        <td className={styles.idCell}>{item.id}</td>
                        <td className={styles.numeric}>{item.roundsCount ?? item._count?.rounds ?? item.rounds?.length ?? 0}</td>
                        <td className={styles.numeric}>{item.schoolsCount ?? item._count?.school_registrations ?? 0}</td>
                        <td className={styles.actionColumn}>
                          <div className={styles.rowActions}>
                            <Button size="sm" onClick={() => setInviteOlympiadId(item.id)}>
                              Invite Educator
                            </Button>
                            <Button size="sm" variant="outline" to={`/organiser/olympiads/${item.id}/edit`}>
                              Edit olympiad
                            </Button>
                            {deletingId === item.id ? (
                              <>
                                <Button size="sm" className={styles.dangerSolid} onClick={() => handleDeleteOlympiad(item.id)}>
                                  Yes, delete
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setDeletingId(null)}>
                                  No
                                </Button>
                              </>
                            ) : (
                              <Button size="sm" variant="outline" className={styles.dangerOutline} onClick={() => setDeletingId(item.id)}>
                                Delete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedId === item.id && (
                        <tr className={styles.expandedRow}>
                          <td colSpan={5}>
                            {loadingRounds ? (
                              <p className={styles.muted}>Loading rounds...</p>
                            ) : rounds.length === 0 ? (
                              <p className={styles.muted}>No rounds yet.</p>
                            ) : (
                              <table className={styles.roundsTable}>
                                <thead>
                                  <tr>
                                    <th>Round</th>
                                    <th>State</th>
                                    <th>Opens</th>
                                    <th>Closes</th>
                                    <th className={styles.numeric}>Submissions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rounds.map((r) => (
                                    <tr key={r.id}>
                                      <td className={styles.roundName}>{r.name}</td>
                                      <td>
                                        <span className={`${styles.statePill} ${roundStateClasses[r.state] ?? ""}`}>
                                          {r.state?.replace("_", " ")}
                                        </span>
                                      </td>
                                      <td className={styles.muted}>
                                        {r.opens_at ? formatDateInZone(r.opens_at, item.timezone ?? DEFAULT_TIMEZONE) : "—"}
                                      </td>
                                      <td className={styles.muted}>
                                        {r.closes_at ? formatDateInZone(r.closes_at, item.timezone ?? DEFAULT_TIMEZONE) : "—"}
                                      </td>
                                      <td className={styles.numeric}>{r._count?.submissions ?? 0}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      {inviteOlympiadId && (
        <InviteEducatorDialog onClose={() => setInviteOlympiadId(null)}>
          <InviteEducatorForm
            olympiads={olympiads}
            initialOlympiadId={inviteOlympiadId}
            onCancel={() => setInviteOlympiadId(null)}
            onSuccess={() => {
              loadOlympiads();
            }}
          />
        </InviteEducatorDialog>
      )}
    </AppShell>
  );
}
