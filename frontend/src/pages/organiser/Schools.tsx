import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { TablePanel, Td, Th } from "../../components/ui/Table";
import { organiserNav, schools } from "../../lib/mockData";
import styles from "./Schools.module.css";

function Schools() {
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
          description="5 registered schools taking part in this olympiad."
        />

        <TablePanel minWidth="58rem">
          <thead>
            <tr>
              <Th>School</Th>
              <Th>District</Th>
              <Th numeric>Entrants</Th>
              <Th>Educators</Th>
            </tr>
          </thead>
          <tbody>
            {schools.map((school) => (
              <tr key={school.name}>
                <Td strong muted={false}>
                  {school.name}
                </Td>
                <Td>{school.district}</Td>
                <Td numeric>{school.entrants}</Td>
                <Td muted={false}>
                  <ul className={styles.educators}>
                    {school.educators.map((educator) => (
                      <li key={educator.email}>
                        <span className={styles.educatorName}>{educator.name}</span>
                        <span className={styles.educatorRole}> · {educator.role}</span>
                        <a href={`mailto:${educator.email}`}>{educator.email}</a>
                      </li>
                    ))}
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
