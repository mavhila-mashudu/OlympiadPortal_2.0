import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { FileInput } from "../../components/ui/FileInput";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Textarea } from "../../components/ui/Textarea";
import { organiserNav } from "../../lib/mockData";
import styles from "./CreateRound.module.css";

function CreateRound() {
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
          title="Create a round"
          description="Define the schedule and upload the paper and memo for a new round."
          actions={
            <Button to="/organiser" variant="outline">
              Cancel
            </Button>
          }
        />

        <Card className={styles.formCard}>
          <form className={styles.form}>
            <div className={styles.field}>
              <Label htmlFor="round-name">
                Round name<span className={styles.required}> *</span>
              </Label>
              <Input
                id="round-name"
                name="roundName"
                placeholder="Round 5 — Regional"
                required
              />
            </div>

            <div className={styles.field}>
              <Label htmlFor="round-notes">Instructions for educators</Label>
              <Textarea
                id="round-notes"
                name="notes"
                placeholder="Any notes shown to educators alongside the paper."
                rows={3}
              />
            </div>

            <div className={styles.dateGrid}>
              <div className={styles.field}>
                <Label htmlFor="opens-at">
                  Opens at<span className={styles.required}> *</span>
                </Label>
                <Input id="opens-at" name="opensAt" required type="datetime-local" />
              </div>
              <div className={styles.field}>
                <Label htmlFor="closes-at">
                  Closes at<span className={styles.required}> *</span>
                </Label>
                <Input id="closes-at" name="closesAt" required type="datetime-local" />
              </div>
            </div>

            <div className={styles.field}>
              <Label htmlFor="paper-file">Paper file</Label>
              <FileInput
                accept=".pdf,.doc,.docx,.csv,.xlsx"
                aria-describedby="paper-file-hint"
                id="paper-file"
              />
              <p id="paper-file-hint" className={styles.hint}>
                PDF released to schools when the round opens.
              </p>
            </div>

            <div className={styles.field}>
              <Label htmlFor="memo-file">Memo file</Label>
              <FileInput
                accept=".pdf,.doc,.docx,.csv,.xlsx"
                aria-describedby="memo-file-hint"
                id="memo-file"
              />
              <p id="memo-file-hint" className={styles.hint}>
                Used for auto-marking. Can be added later.
              </p>
            </div>

            <div className={styles.actions}>
              <Button type="submit">Create round</Button>
              <Button to="/organiser" variant="outline">
                Back to dashboard
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}

export default CreateRound;
