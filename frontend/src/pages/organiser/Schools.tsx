import { Building2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ErrorAlert } from "../../components/ui/Feedback";
import { api } from "../../lib/api";
import { organiserNav } from "../../lib/mockData";
import { friendlyErrorMessage } from "../../lib/feedback";
import { getCurrentOlympiad, type Olympiad } from "../../lib/olympiad";
import { InviteEducatorDialog, InviteEducatorForm } from "./InviteEducatorForm";
import styles from "./Schools.module.css";

// GET /olympiads/:id/schools lists the schools taking part, plus the educators
// who were invited and have not answered yet
type RegisteredSchool = {
  id: string;
  name: string;
  address: string | null;
  entrants: number;
  educators: { name: string; email: string }[];
  contactEmail: string | null;
  status: "pending" | "accepted" | "declined";
};

const statusLabels: Record<RegisteredSchool["status"], string> = {
  pending: "Invited",
  accepted: "Participating",
  declined: "Declined",
};

const statusClasses: Record<RegisteredSchool["status"], string> = {
  pending: styles.statusPending,
  accepted: styles.statusAccepted,
  declined: styles.statusExpired,
};

export function SchoolsPage() {
  const [olympiad, setOlympiad] = useState<Olympiad | null>(null);
  const [schools, setSchools] = useState<RegisteredSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  async function fetchSchools(olympiadId: string) {
    const data = await api.get<{ schools: RegisteredSchool[] }>(
      `/olympiads/${olympiadId}/schools`,
    );
    setSchools(data.schools || []);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const current = await getCurrentOlympiad();
        if (!cancelled) setOlympiad(current);

        if (current?.id) {
          await fetchSchools(current.id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(friendlyErrorMessage(err, "We couldn’t load schools and educators. Please try again."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

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
          title="Registered Schools"
          description={
            olympiad
              ? `Schools taking part in ${olympiad.name}, and outstanding invitations.`
              : "Invite educators to bring their schools into an olympiad."
          }
          actions={
            <Button icon={<Plus aria-hidden="true" />} onClick={() => setIsInviteOpen(true)}>
              Invite educator
            </Button>
          }
        />

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} onRetry={() => window.location.reload()} />}

        <Card padded={false} className={styles.tableCard}>
          <div className={styles.tableScroller}>
            <table className={styles.roundsTable}>
              <thead>
                <tr>
                  <th>School Name</th>
                  <th>Registered Educators</th>
                  <th>Entrants</th>
                  <th>Contact</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {!loading && schools.length === 0 && (
                  <tr>
                    <td className={styles.emptyCell} colSpan={5}>
                      No schools taking part yet. Click "Invite educator" to invite one.
                    </td>
                  </tr>
                )}
                {schools.map((school) => (
                  <tr key={school.id}>
                    <td>
                      <div className={styles.schoolName}>
                        <Building2 aria-hidden="true" size={16} />
                        <strong>{school.name}</strong>
                      </div>
                      {school.address && <small className={styles.address}>{school.address}</small>}
                    </td>
                    <td>
                      <strong className={styles.educatorCount}>{school.educators.length}</strong>
                      {school.educators.length > 0 && (
                        <ul className={styles.educators}>
                          {school.educators.map((educator) => (
                            <li key={educator.email}>
                              <span className={styles.educatorName}>{educator.name}</span>
                              <a href={`mailto:${educator.email}`}>{educator.email}</a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td>{school.entrants}</td>
                    <td>{school.contactEmail ?? "—"}</td>
                    <td>
                      <span className={`${styles.status} ${statusClasses[school.status] ?? ""}`}>
                        {statusLabels[school.status] ?? school.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {isInviteOpen && (
          <InviteEducatorDialog onClose={() => setIsInviteOpen(false)}>
            {olympiad?.id ? (
              <InviteEducatorForm
                olympiadId={olympiad.id}
                onSuccess={() => {
                  if (olympiad.id) fetchSchools(olympiad.id);
                }}
                onCancel={() => setIsInviteOpen(false)}
              />
            ) : (
              <Card padded>
                <p className={styles.modalError}>No active olympiad is selected.</p>
                <Button onClick={() => setIsInviteOpen(false)}>Close</Button>
              </Card>
            )}
          </InviteEducatorDialog>
        )}
      </div>
    </AppShell>
  );
}


export default SchoolsPage;
