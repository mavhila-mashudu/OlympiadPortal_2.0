import { Building2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { api } from "../../lib/api";
import { organiserNav } from "../../lib/mockData";
import { getCurrentOlympiad, type Olympiad } from "../../lib/olympiad";
import { InviteSchoolForm } from "./InviteSchoolForm";
import styles from "./Schools.module.css";

type RegisteredSchool = {
  id: string;
  name: string;
  created_at: string;
  _count?: {
    educators?: number;
    entrant_registrations?: number;
  };
};

export function SchoolsPage() {
  const [olympiad, setOlympiad] = useState<Olympiad | null>(null);
  const [schools, setSchools] = useState<RegisteredSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  async function fetchSchools(olympiadId: string) {
    try {
      const data = await api.get<{ schools: RegisteredSchool[] }>(
        `/olympiads/${olympiadId}/schools`
      );
      setSchools(data.schools || []);
    } catch (err) {
      console.warn("Could not fetch schools:", err);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
<<<<<<< HEAD
        const current = await getCurrentOlympiad();
        if (!cancelled) setOlympiad(current);

        if (current?.id) {
          await fetchSchools(current.id);
        }
=======
        const olympiad = await getCurrentOlympiad();
        const { schools: list } = await api.get<{ schools: School[] }>(
          `/olympiads/${olympiad.id}/schools`,
        );
        if (!cancelled) setSchools(list);
>>>>>>> origin/main
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load olympiad data"
          );
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
        <header className={styles.pageHeader}>
          <div>
            <h1>Registered Schools</h1>
            <p>
              {olympiad
                ? `Manage schools invited to ${olympiad.name}.`
                : "Manage school invitations and active participating institutions."}
            </p>
          </div>
          <div className={styles.actions}>
            <Button
              icon={<Plus aria-hidden="true" />}
              onClick={() => setIsInviteOpen(true)}
            >
              Invite school
            </Button>
          </div>
        </header>

<<<<<<< HEAD
        {error && <Card className={styles.tableCard}>{error}</Card>}

        <Card padded={false} className={styles.tableCard}>
          <div className={styles.tableScroller}>
            <table className={styles.roundsTable}>
              <thead>
                <tr>
                  <th>School Name</th>
                  <th>Registered Educators</th>
                  <th>Entrants</th>
                  <th>Date Joined</th>
                </tr>
              </thead>
              <tbody>
                {!loading && schools.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      No schools registered yet. Click "Invite school" to send an invitation.
                    </td>
                  </tr>
                )}
                {schools.map((school) => (
                  <tr key={school.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Building2 size={16} />
                        <strong>{school.name}</strong>
                      </div>
                    </td>
                    <td>{school._count?.educators ?? 0}</td>
                    <td>{school._count?.entrant_registrations ?? 0}</td>
                    <td>{new Date(school.created_at).toLocaleDateString("en-ZA")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* --- INVITATION MODAL DIALOG --- */}
        {isInviteOpen && (
          <div style={overlayStyle}>
            <div style={modalStyle}>
              {olympiad?.id ? (
                <InviteSchoolForm
                  olympiadId={olympiad.id}
                  onSuccess={() => {
                    if (olympiad.id) fetchSchools(olympiad.id);
                  }}
                  onCancel={() => setIsInviteOpen(false)}
                />
              ) : (
                <Card padded>
                  <p style={{ color: "red" }}>No active Olympiad selected.</p>
                  <Button onClick={() => setIsInviteOpen(false)}>Close</Button>
                </Card>
              )}
            </div>
          </div>
        )}
=======
        {error && <p>{error}</p>}

        <TablePanel minWidth="52rem">
          <thead>
            <tr>
              <Th>School</Th>
              <Th numeric>Entrants</Th>
              <Th>Educators</Th>
            </tr>
          </thead>
          <tbody>
            {!loading && schools.length === 0 && (
              <tr>
                <td colSpan={3}>No schools registered yet.</td>
              </tr>
            )}
            {schools.map((school) => (
              <tr key={school.id}>
                <Td strong muted={false}>
                  {school.name}
                </Td>
                <Td numeric>{school.entrants}</Td>
                <Td muted={false}>
                  <ul className={styles.educators}>
                    {school.educators.map((educator) => (
                      <li key={educator.email}>
                        <span className={styles.educatorName}>
                          {educator.name}
                        </span>
                        <a href={`mailto:${educator.email}`}>
                          {educator.email}
                        </a>
                      </li>
                    ))}
                    {school.educators.length === 0 && (
                      <li className={styles.educatorName}>No educators yet</li>
                    )}
                  </ul>
                </Td>
              </tr>
            ))}
          </tbody>
        </TablePanel>
>>>>>>> origin/main
      </div>
    </AppShell>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  maxWidth: "500px",
  width: "90%",
};

export default SchoolsPage;