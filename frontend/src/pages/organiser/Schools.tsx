import { useEffect, useState } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { TablePanel, Td, Th } from "../../components/ui/Table";
import { organiserNav } from "../../lib/mockData";
import { api } from "../../lib/api";
import { getCurrentOlympiad } from "../../lib/olympiad";
import styles from "./Schools.module.css";

type SchoolEducator = { name: string; email: string };

type School = {
  id: string;
  name: string;
  address: string | null;
  entrants: number;
  educators: SchoolEducator[];
  contactEmail: string | null;
  status: "pending" | "accepted" | "expired";
};

function Schools() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const olympiad = await getCurrentOlympiad();
        const { schools: list } = await api.get<{ schools: School[] }>(
          `/olympiads/${olympiad.id}/schools`,
        );
        if (!cancelled) setSchools(list);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load schools");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
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
          title="Schools & educators"
          description={
            loading
              ? "Loading registered schools…"
              : `${schools.length} school invitation${schools.length === 1 ? "" : "s"} and registration${schools.length === 1 ? "" : "s"} for this olympiad.`
          }
        />

        {error && <p>{error}</p>}

        <TablePanel minWidth="52rem">
          <thead>
            <tr>
              <Th>School</Th>
              <Th>Status</Th>
              <Th numeric>Entrants</Th>
              <Th>Educators</Th>
            </tr>
          </thead>
          <tbody>
            {!loading && schools.length === 0 && (
              <tr>
                <td colSpan={4}>No school invitations or registrations yet.</td>
              </tr>
            )}
            {schools.map((school) => (
              <tr key={school.id}>
                <Td strong muted={false}>
                  {school.name}
                </Td>
                <Td muted={false}>
                  <span className={`${styles.status} ${styles[`status${school.status[0].toUpperCase()}${school.status.slice(1)}`]}`}>
                    {school.status[0].toUpperCase() + school.status.slice(1)}
                  </span>
                </Td>
                <Td numeric>{school.status === "accepted" ? school.entrants : "—"}</Td>
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
                      <li className={styles.educatorName}>
                        {school.status === "pending" && school.contactEmail
                          ? `Invitation sent to ${school.contactEmail}`
                          : school.status === "expired"
                            ? "Invitation expired"
                            : "No educators yet"}
                      </li>
                    )}
                  </ul>
                </Td>
              </tr>
            ))}
          </tbody>
        </TablePanel>
      </div>
    </AppShell>
  );
}

export default Schools;
