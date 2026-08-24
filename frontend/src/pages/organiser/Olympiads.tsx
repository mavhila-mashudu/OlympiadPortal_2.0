import React, { useEffect, useState } from "react";
import { AppShell as AppShellComponent } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { api } from "../../lib/api";
import { organiserNav } from "../../lib/mockData";

const AppShell = AppShellComponent as any;

export default function Olympiads() {
  const [olympiads, setOlympiads] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <AppShell navItems={organiserNav} role="Organiser">
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
                  <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "1rem 1.25rem", fontWeight: 600 }}>{item.name}</td>
                    <td style={{ padding: "1rem 1.25rem", color: "#6b7280", fontFamily: "monospace" }}>{item.id}</td>
                    <td style={{ padding: "1rem 1.25rem", textAlign: "center" }}>{item.roundsCount ?? item.rounds?.length ?? 0}</td>
                    <td style={{ padding: "1rem 1.25rem", textAlign: "center" }}>{item.schoolsCount ?? item._count?.school_registrations ?? 0}</td>
                    <td style={{ padding: "1rem 1.25rem", textAlign: "right" }}>
                      <Button style={{ padding: "0.4rem 0.85rem", fontSize: "0.8125rem" }}>
                        Invite School
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}