import React, { useEffect, useState } from "react";
import { AppShell as AppShellComponent } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { api } from "../../lib/api";
import { organiserNav } from "../../lib/mockData";
import { getCurrentOlympiad } from "../../lib/olympiad";

const AppShell = AppShellComponent as any;

export default function CreateRound() {
  const [olympiads, setOlympiads] = useState<any[]>([]);
  const [selectedOlympiadId, setSelectedOlympiadId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOlympiads() {
      try {
        const res: any = await api.get("/olympiads");
        const list = res.olympiads || res || [];
        const current = await getCurrentOlympiad();
        setOlympiads(list);
        if (current?.id) {
          setSelectedOlympiadId(current.id);
        } else if (list.length > 0) {
          setSelectedOlympiadId(list[0].id);
        }
      } catch (err) {
        setError("Failed to load olympiads list.");
      }
    }
    fetchOlympiads();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const olympiadId = (formData.get("olympiadId") as string) || selectedOlympiadId;
    const name = formData.get("roundName") as string;
    const notes = (formData.get("notes") as string) || undefined;
    const opensAtLocal = formData.get("opensAt") as string;
    const closesAtLocal = formData.get("closesAt") as string;

    setSubmitting(true);
    setError(null);

    try {
      await api.post(`/olympiads/${olympiadId}/rounds`, {
        name,
        notes,
        opens_at: new Date(opensAtLocal).toISOString(),
        closes_at: new Date(closesAtLocal).toISOString(),
      });
      alert("Round created successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to create round.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell navItems={organiserNav} role="Organiser">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <PageHeader
          title="Create a round"
          description="Define the schedule and upload the paper and memo for a new round."
        />
        <Button variant="outline" type="button" onClick={() => window.history.back()}>
          Cancel
        </Button>
      </div>

      <Card style={{ maxWidth: "680px", margin: "0 auto", padding: "1.5rem" }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <Label htmlFor="olympiadId">Target Olympiad*</Label>
            <select
              id="olympiadId"
              name="olympiadId"
              value={selectedOlympiadId}
              onChange={(e) => setSelectedOlympiadId(e.target.value)}
              style={{
                width: "100%",
                padding: "0.5rem",
                marginTop: "0.25rem",
                borderRadius: "0.375rem",
                border: "1px solid #d1d5db"
              }}
              required
            >
              {olympiads.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="roundName">Round name*</Label>
            <Input id="roundName" name="roundName" defaultValue="Round 1 — Qualifier" required />
          </div>

          <div>
            <Label htmlFor="notes">Instructions for educators</Label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Any notes shown to educators alongside the paper."
              style={{
                width: "100%",
                padding: "0.5rem",
                marginTop: "0.25rem",
                borderRadius: "0.375rem",
                border: "1px solid #d1d5db",
                fontFamily: "inherit"
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <Label htmlFor="opensAt">Opens at*</Label>
              <Input id="opensAt" name="opensAt" type="datetime-local" required />
            </div>

            <div>
              <Label htmlFor="closesAt">Closes at*</Label>
              <Input id="closesAt" name="closesAt" type="datetime-local" required />
            </div>
          </div>

          <div>
            <Label htmlFor="paper">Paper file</Label>
            <Input id="paper" name="paper" type="file" accept=".pdf" />
            <p style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.25rem" }}>
              PDF released to schools when the round opens.
            </p>
          </div>

          <div>
            <Label htmlFor="memo">Memo file</Label>
            <Input id="memo" name="memo" type="file" accept=".pdf" />
            <p style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.25rem" }}>
              Used for auto-marking. Can be added later.
            </p>
          </div>

          {error && <p style={{ color: "red", fontSize: "0.875rem" }}>{error}</p>}

          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Create Round"}
          </Button>
        </form>
      </Card>
    </AppShell>
  );
}