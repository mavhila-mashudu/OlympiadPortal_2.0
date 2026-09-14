import { useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Select } from "../../components/ui/Select";
import { TablePanel, Td, Th } from "../../components/ui/Table";
import { educatorNav } from "../../lib/mockData";
import {
  useEducatorRounds,
  useEducatorEntrants,
  useRegisterEntrants,
  useProgressionInfo,
  type EducatorEntrant,
} from "../../lib/educatorApi";
import styles from "./Entrants.module.css";

function Entrants() {
  const { data: roundsData } = useEducatorRounds();
  const rounds = roundsData?.rounds ?? [];
  const schoolName = roundsData?.school?.name ?? "Your school";

  // Filter to rounds that can accept registrations (not fully closed)
  const registerableRounds = rounds.filter(
    (r) => r.state === "scheduled" || r.state === "open",
  );

  const [selectedRoundId, setSelectedRoundId] = useState(
    registerableRounds[0]?.id ?? "",
  );
  const [fullName, setFullName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [grade, setGrade] = useState("11");
  const [successMessage, setSuccessMessage] = useState("");

  const { data: entrants, isLoading: entrantsLoading } =
    useEducatorEntrants(selectedRoundId);
  const registerMutation = useRegisterEntrants(selectedRoundId);
  const { data: progression } = useProgressionInfo(selectedRoundId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !selectedRoundId) return;

    try {
      await registerMutation.mutateAsync([
        {
          full_name: fullName.trim(),
          grade,
          external_ref: studentNumber.trim() || undefined,
        },
      ]);
      setFullName("");
      setStudentNumber("");
      setSuccessMessage(
        `${fullName.trim()} has been registered for this round.`,
      );
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <AppShell
      activeRole="educator"
      navItems={educatorNav}
      organisation={schoolName}
      portalLabel="Educator portal"
      userInitials=""
      userName=""
    >
      <div className={styles.stack}>
        <PageHeader
          title="Register entrants"
          description="Add students from your school to an upcoming round so their results can be tracked."
        />

        {rounds.length === 0 ? (
          <p className={styles.loading}>
            Loading rounds…
          </p>
        ) : (
          <>
            <div className={styles.roundField}>
              <Label htmlFor="entrant-round">Round</Label>
              <Select
                id="entrant-round"
                value={selectedRoundId}
                onChange={(e) => {
                  setSelectedRoundId(e.target.value);
                  setSuccessMessage("");
                }}
              >
                {registerableRounds.length === 0 ? (
                  <option value="">No rounds accepting registrations</option>
                ) : (
                  registerableRounds.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))
                )}
              </Select>
            </div>

            {selectedRoundId && (
              <>
                {progression?.requiresQualification && (
                  <div className={styles.successNote} style={{ backgroundColor: "#fef3c7", borderColor: "#f59e0b" }}>
                    <span>
                      This round requires entrants to have qualified from{" "}
                      <strong>{progression.previousRound?.name}</strong>.
                      Only students who met the benchmark ({progression.previousRound?.qualifyingThreshold ?? "—"} points) can be registered.
                    </span>
                  </div>
                )}

                {successMessage && (
                  <div className={styles.successNote}>
                    <CheckCircle2 aria-hidden="true" />
                    <span>{successMessage}</span>
                  </div>
                )}

                <Card className={styles.formCard}>
                  <form className={styles.form} onSubmit={handleSubmit}>
                    <div className={styles.field}>
                      <Label htmlFor="entrant-name">
                        Full name
                        <span className={styles.required}> *</span>
                      </Label>
                      <Input
                        id="entrant-name"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                    <div className={styles.field}>
                      <Label htmlFor="entrant-number">Student number</Label>
                      <Input
                        id="entrant-number"
                        value={studentNumber}
                        onChange={(e) => setStudentNumber(e.target.value)}
                      />
                    </div>
                    <div className={styles.field}>
                      <Label htmlFor="entrant-grade">Grade</Label>
                      <Select
                        id="entrant-grade"
                        value={grade}
                        onChange={(e) => setGrade(e.target.value)}
                      >
                        <option value="8">Grade 8</option>
                        <option value="9">Grade 9</option>
                        <option value="10">Grade 10</option>
                        <option value="11">Grade 11</option>
                        <option value="12">Grade 12</option>
                      </Select>
                    </div>
                    <Button
                      icon={<Plus aria-hidden="true" />}
                      type="submit"
                      disabled={
                        !fullName.trim() || registerMutation.isPending
                      }
                    >
                      {registerMutation.isPending
                        ? "Registering…"
                        : "Add entrant"}
                    </Button>
                  </form>
                </Card>

                {/* Registered entrants table */}
                {entrantsLoading ? (
                  <p className={styles.loading}>Loading entrants…</p>
                ) : entrants && entrants.length > 0 ? (
                  <TablePanel
                    title={`Registered entrants (${entrants.length})`}
                    minWidth="36rem"
                  >
                    <thead>
                      <tr>
                        <Th>Full name</Th>
                        <Th>Student no.</Th>
                        <Th>Grade</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {entrants.map((ent: EducatorEntrant) => (
                        <tr key={ent.id}>
                          <Td strong muted={false}>
                            {ent.full_name}
                          </Td>
                          <Td>{ent.external_ref ?? "—"}</Td>
                          <Td>{ent.grade ?? "—"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TablePanel>
                ) : (
                  <Card
                    className={styles.emptyCard}
                    padded={false}
                    aria-labelledby="entrants-heading"
                  >
                    <div className={styles.emptyHeader}>
                      <h2 id="entrants-heading">
                        Registered entrants (0)
                      </h2>
                    </div>
                    <p>No entrants registered for this round yet.</p>
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

export default Entrants;
