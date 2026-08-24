import React, { useEffect, useState } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { api } from "../../lib/api";
import { organiserNav } from "../../lib/mockData";
import type { Olympiad } from "../../lib/olympiad";
import { InviteSchoolForm } from "./InviteSchoolForm";
import styles from "./Olympiads.module.css";

export default function Olympiads() {
  const [olympiads, setOlympiads] = useState<Olympiad[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOlympiadForInvite, setSelectedOlympiadForInvite] = useState<string | null>(null);

  const fetchOlympiads = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Olympiad[]>("/olympiads");
      const list = Array.isArray(data) ? data : (data as any).olympiads || [];
      setOlympiads(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch olympiads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOlympiads();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const created = await api.post<Olympiad>("/olympiads", { name: name.trim() });
      setName("");
      setOlympiads((prev) => [created, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create Olympiad");
    } finally {
      setSubmitting(false);
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

        <Card className={styles.statCard}>
          <form onSubmit={handleCreate} className={styles.stack}>
            <div className={styles.stack} style={{ gap: "0.5rem" }}>
              <Label htmlFor="olympiad-name">
                Create new Olympiad<span className={styles.required}> *</span>
              </Label>
              <div className={styles.actions}>
                <Input
                  id="olympiad-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <Button type="submit" disabled={submitting || !name.trim()}>
                  {submitting ? "Creating..." : "Create"}
                </Button>
              </div>
            </div>
            {error && (
              <p className={styles.hint} style={{ color: "var(--destructive, red)" }}>
                {error}
              </p>
            )}
          </form>
        </Card>

        {selectedOlympiadForInvite && (
          <Card className={styles.statCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0 }}>Invite School</h3>
              <Button variant="outline" onClick={() => setSelectedOlympiadForInvite(null)}>
                Close Form
              </Button>
            </div>
            <InviteSchoolForm
              olympiadId={selectedOlympiadForInvite}
              onSuccess={() => {
                fetchOlympiads();
              }}
            />
          </Card>
        )}

        <Card
          className={styles.tableCard}
          padded={false}
          aria-labelledby="olympiads-heading"
        >
          <div className={styles.tableHeader}>
            <h2 id="olympiads-heading">Registered Olympiads</h2>
          </div>
          <div className={styles.tableScroller}>
            <table className={styles.olympiadsTable}>
              <thead>
                <tr>
                  <th>Olympiad Name</th>
                  <th>ID</th>
                  <th className={styles.numeric}>Rounds</th>
                  <th className={styles.numeric}>Schools Registered</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5}>Loading olympiads...</td>
                  </tr>
                ) : olympiads.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No olympiads registered yet. Create one above to get started.</td>
                  </tr>
                ) : (
                  olympiads.map((item) => (
                    <tr key={item.id}>
                      <td className={styles.olympiadName}>{item.name}</td>
                      <td style={{ color: "var(--muted-foreground, #666)" }}>{item.id}</td>
                      <td className={styles.numeric}>{item._count?.rounds ?? 0}</td>
                      <td className={styles.numeric}>
                        {item._count?.school_registrations ?? 0}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Button
                          type="button"
                          onClick={() => setSelectedOlympiadForInvite(item.id)}
                        >
                          Invite School
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}