import React, { useEffect, useState } from "react";
import { AppShell as AppShellComponent } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card } from "../../components/ui/Card";
import { api } from "../../lib/api";
import { organiserNav } from "../../lib/mockData";
import { getCurrentOlympiad } from "../../lib/olympiad";

const AppShell = AppShellComponent as any;

export default function OrganiserDashboard() {
  const [rounds, setRounds] = useState<any[]>([]);
  const [selectedOlympiad, setSelectedOlympiad] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadRounds(olympiadId: string) {
    try {
      const res: any = await api.get(`/olympiads/${olympiadId}/rounds`);
      const roundList = res.rounds || res || [];
      setRounds(roundList);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res: any = await api.get("/olympiads");
        const allOlympiads = res.olympiads || res || [];
        const current = await getCurrentOlympiad();

        if (!cancelled) {
          const selected = current || allOlympiads[0] || null;
          setSelectedOlympiad(selected);
          if (selected?.id) {
            await loadRounds(selected.id);
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load dashboard data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const submissionsTotal = rounds.reduce(
    (sum, round) => sum + (round.submissionsCount ?? round._count?.submissions ?? 0),
    0
  );
  const openCount = rounds.filter((round) => round.state === "open").length;
  const schoolsCount =
    selectedOlympiad?.schoolsCount ?? selectedOlympiad?._count?.school_registrations ?? 0;

  return (
    <AppShell navItems={organiserNav} role="Organiser">
      <PageHeader title="Dashboard" description="Overview of active competition rounds and statistics." />
      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <Card>
          <h4>Total Submissions</h4>
          <p>{loading ? "..." : submissionsTotal}</p>
        </Card>
        <Card>
          <h4>Open Rounds</h4>
          <p>{loading ? "..." : openCount}</p>
        </Card>
        <Card>
          <h4>Registered Schools</h4>
          <p>{loading ? "..." : schoolsCount}</p>
        </Card>
      </div>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </AppShell>
  );
}