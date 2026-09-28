import React, { Fragment, useEffect, useState } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { api } from "../../lib/api";
import { organiserNav } from "../../lib/mockData";
import { InviteEducatorForm } from "./InviteEducatorForm";

export default function Olympiads() {
  const [olympiads, setOlympiads] = useState<any[]>([]);
  const [name, setName] = useState("");
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
    } catch (err: any) {
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
      await api.post("/olympiads", { name });
      setName("");
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
      <PageHeader
        title="Olympiads"
        description="Manage and create competition editions."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Create Form */}
        <Card style={{ padding: "1.25rem" }}>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontWeight: 600, fontSize: "0.875rem" }}>Create new Olympiad*</label>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 2026 National Competition"
                required
                style={{ flex: 1 }}
              />
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create"}
              </Button>
            </div>
            {error && <p style={{ color: "red", marginTop: "0.25rem" }}>{error}</p>}
          </form>
        </Card>

        {/* Registered Olympiads Table */}
        <Card style={{ padding: "0", overflow: "hidden" }}>
          <div style={{ padding: "1.25rem", borderBottom: "1px solid #e5e7eb" }}>
            <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>Registered Olympiads</h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb", color: "#6b7280" }}>
                <th style={{ padding: "0.75rem 1.25rem", fontWeight: 600 }}>Olympiad Name</th>
                <th style={{ padding: "0.75rem 1.25rem", fontWeight: 600 }}>ID</th>
                <th style={{ padding: "0.75rem 1.25rem", fontWeight: 600, textAlign: "center" }}>Rounds</th>
                <th style={{ padding: "0.75rem 1.25rem", fontWeight: 600, textAlign: "center" }}>Schools Registered</th>
                <th style={{ padding: "0.75rem 1.25rem", fontWeight: 600, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {olympiads.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "1.5rem", textAlign: "center", color: "#9ca3af" }}>
                    No olympiads registered yet.
                  </td>
                </tr>
              ) : (
                olympiads.map((item) => (
                  <Fragment key={item.id}>
                  <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "1rem 1.25rem", fontWeight: 600 }}>
                        <button
                          type="button"
                          onClick={() => toggleExpand(item.id)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            font: "inherit",
                            fontWeight: 600,
                            color: "var(--foreground, #111827)",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <span style={{
                            display: "inline-block",
                            transition: "transform 0.15s",
                            transform: expandedId === item.id ? "rotate(90deg)" : "rotate(0deg)",
                            fontSize: "0.75rem",
                            color: "#9ca3af",
                          }}>&#9654;</span>
                          {item.name}
                        </button>
                    </td>
                    <td style={{ padding: "1rem 1.25rem", color: "#6b7280", fontFamily: "monospace" }}>{item.id}</td>
                    <td style={{ padding: "1rem 1.25rem", textAlign: "center" }}>{item.roundsCount ?? item._count?.rounds ?? item.rounds?.length ?? 0}</td>
                    <td style={{ padding: "1rem 1.25rem", textAlign: "center" }}>{item.schoolsCount ?? item._count?.school_registrations ?? 0}</td>
                    <td style={{ padding: "1rem 1.25rem", textAlign: "right", display: "flex", gap: "0.375rem", justifyContent: "flex-end" }}>
                      <Button onClick={() => setInviteOlympiadId(item.id)} style={{ padding: "0.4rem 0.85rem", fontSize: "0.8125rem" }}>
                        Invite Educator
                      </Button>
                      <Button
                        variant="outline"
                        to={`/organiser/olympiads/${item.id}/edit`}
                        style={{ padding: "0.4rem 0.85rem", fontSize: "0.8125rem" }}
                      >
                        Edit olympiad
                      </Button>
                      {deletingId === item.id ? (
                        <>
                          <Button
                            onClick={() => handleDeleteOlympiad(item.id)}
                            style={{ padding: "0.4rem 0.85rem", fontSize: "0.8125rem", color: "#fff", background: "#dc2626" }}
                          >
                            Yes, delete
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setDeletingId(null)}
                            style={{ padding: "0.4rem 0.85rem", fontSize: "0.8125rem" }}
                          >
                            No
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => setDeletingId(item.id)}
                          style={{ padding: "0.4rem 0.85rem", fontSize: "0.8125rem", color: "#dc2626" }}
                        >
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                  {expandedId === item.id && (
                    <tr>
                      <td colSpan={5} style={{ padding: 0, borderBottom: "1px solid #f3f4f6" }}>
                        <div style={{ padding: "1rem 1.25rem", background: "#f9fafb" }}>
                          {loadingRounds ? (
                            <p style={{ margin: 0, color: "#9ca3af", fontSize: "0.875rem" }}>Loading rounds...</p>
                          ) : rounds.length === 0 ? (
                            <p style={{ margin: 0, color: "#9ca3af", fontSize: "0.875rem" }}>No rounds yet.</p>
                          ) : (
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                              <thead>
                                <tr style={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>
                                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Round</th>
                                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>State</th>
                                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Opens</th>
                                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Closes</th>
                                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600 }}>Submissions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rounds.map((r) => (
                                  <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                    <td style={{ padding: "0.625rem 0.75rem", fontWeight: 500 }}>{r.name}</td>
                                    <td style={{ padding: "0.625rem 0.75rem" }}>
                                      <span style={{
                                        display: "inline-block",
                                        padding: "0.125rem 0.5rem",
                                        borderRadius: "9999px",
                                        fontSize: "0.75rem",
                                        fontWeight: 500,
                                        background:
                                          r.state === "open" ? "#dcfce7" :
                                          r.state === "closed" ? "#fee2e2" :
                                          r.state === "marking" ? "#fef3c7" :
                                          r.state === "results_released" ? "#dbeafe" :
                                          "#f3f4f6",
                                        color:
                                          r.state === "open" ? "#166534" :
                                          r.state === "closed" ? "#991b1b" :
                                          r.state === "marking" ? "#92400e" :
                                          r.state === "results_released" ? "#1e40af" :
                                          "#374151",
                                      }}>
                                        {r.state?.replace("_", " ")}
                                      </span>
                                    </td>
                                    <td style={{ padding: "0.625rem 0.75rem", color: "#6b7280" }}>
                                      {r.opens_at ? new Date(r.opens_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                                    </td>
                                    <td style={{ padding: "0.625rem 0.75rem", color: "#6b7280" }}>
                                      {r.closes_at ? new Date(r.closes_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                                    </td>
                                    <td style={{ padding: "0.625rem 0.75rem", textAlign: "right", color: "#374151" }}>
                                      {r._count?.submissions ?? 0}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>
      {inviteOlympiadId && (
        <InviteEducatorForm
          olympiads={olympiads}
          initialOlympiadId={inviteOlympiadId}
          onCancel={() => setInviteOlympiadId(null)}
          onSuccess={() => {
            loadOlympiads();
          }}
        />
      )}
    </AppShell>
  );
}
