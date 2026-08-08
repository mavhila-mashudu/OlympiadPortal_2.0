import { Plus } from "lucide-react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Select } from "../../components/ui/Select";
import { educatorNav } from "../../lib/mockData";
import styles from "./Entrants.module.css";

function Entrants() {
  return (
    <AppShell
      activeRole="educator"
      navItems={educatorNav}
      organisation="Rosebank High School"
      portalLabel="Educator portal"
      userInitials="TM"
      userName="Thandi Mokoena"
    >
      <div className={styles.stack}>
        <PageHeader
          title="Register entrants"
          description="Add students from your school to an upcoming round."
        />

        <div className={styles.roundField}>
          <Label htmlFor="entrant-round">Round</Label>
          <Select id="entrant-round">
            <option>Round 3 — Regional</option>
            <option>Round 4 — National Final</option>
          </Select>
        </div>

        <Card className={styles.formCard}>
          <form className={styles.form}>
            <div className={styles.field}>
              <Label htmlFor="entrant-name">
                Full name<span className={styles.required}> *</span>
              </Label>
              <Input id="entrant-name" required />
            </div>
            <div className={styles.field}>
              <Label htmlFor="entrant-number">Student number</Label>
              <Input id="entrant-number" />
            </div>
            <div className={styles.field}>
              <Label htmlFor="entrant-grade">Grade</Label>
              <Select id="entrant-grade" defaultValue="11">
                <option value="8">Grade 8</option>
                <option value="9">Grade 9</option>
                <option value="10">Grade 10</option>
                <option value="11">Grade 11</option>
                <option value="12">Grade 12</option>
              </Select>
            </div>
            <Button icon={<Plus aria-hidden="true" />} type="submit">
              Add entrant
            </Button>
          </form>
        </Card>

        <Card className={styles.emptyCard} padded={false} aria-labelledby="entrants-heading">
          <div className={styles.emptyHeader}>
            <h2 id="entrants-heading">Registered entrants (0)</h2>
          </div>
          <p>No entrants registered for this round yet.</p>
        </Card>
      </div>
    </AppShell>
  );
}

export default Entrants;
