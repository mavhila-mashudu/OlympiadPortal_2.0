# Olympiad Portal — User Stories by Role

Same stories and IDs as the tier-based backlog, regrouped by who the story is for. Each story keeps its tier tag ([B] Basic, [I] Intermediate, [A] Advanced) so you can still filter by milestone within a role. A few stories are written from "the system's" perspective or belong to a supporting role (marker, moderator, reviewer) — those sit in their own section at the end since they're not user-facing in the same way.

---

## ORGANISER

### Setup & round control

- **[B]** B1 — Create an olympiad and define its rounds, so the competition structure exists before anything else can happen.
- **[B]** B2 — Register schools against an olympiad, so only approved schools can participate.
- **[B]** B5 — Set an opening and closing time for a round, so it runs on a schedule without manual intervention.
- **[B]** B9 — Upload a round's paper (and memo), so it becomes available once the round opens.
- **[B]** B10 — Have past papers archived automatically once released, so they're browsable without extra work.
- **[B]** B16 — Have a console to set up a round and watch its state live, so I have visibility without digging through logs.

### Progression, standings & rules

- **[I]** I9 — Set a qualifying threshold on a round, so only entrants who meet it advance.
- **[I]** I14 — Configure which reminders/notifications fire, on what trigger and conditions, and what action follows, so I control comms without needing a developer.
- **[I]** I15 — Test a configured rule against a real round before it goes live, so I can catch mistakes before they reach schools.
- **[I]** I16 — Have standings published per school and per entrant, so results are comparable at both levels.

### Advanced controls

- **[A]** A4 — Have a submission that arrives exactly on the deadline boundary settled consistently and defensibly, so no school can dispute the ruling as arbitrary.
- **[A]** A5 — Have papers drawn from a question bank, so I'm not hand-assembling every paper from scratch.
- **[A]** A9 — Have a single paper sittable either online or on paper, so schools without reliable internet aren't excluded.
- **[A]** A15 — Run several olympiads at once, each on its own schedule and timezone, so the portal can serve more than one competition simultaneously.
- **[A]** A16 — Have all olympiads share one archive of past papers, so content isn't duplicated per competition.
- **[A]** A17 — Have every automatic action the portal takes logged, so nothing happens invisibly.
- **[A]** A18 — Replay a round after the fact, so I can see exactly what the portal did and when, e.g. when investigating a dispute.

### Platform

- **[P]** P4 — Have the portal integrate with an external service (e.g. notifications or OMR scanning), so the portal doesn't have to reinvent solved problems.

---

## EDUCATOR (incl. school-level access)

### Registration & access

- **[B]** B3 — Register my school's educators, so they can act on the school's behalf. _(school)_
- **[B]** B4 — Register the entrants I'm putting forward for a round, so their results can be tracked.
- **[B]** B17 — Have a single place to find papers, submit results, and collect results, so I don't need separate tools or a shared folder.

### Round participation

- **[B]** B7 — Be prevented from downloading a paper before its round opens, so no one gets early access.
- **[B]** B8 — Be prevented from submitting results after a round closes, so the deadline is meaningful.
- **[B]** B11 — Download the current round's paper and any released past papers, so I can administer the test at my school.
- **[B]** B12 — Upload my school's results within the round's open window, so they count toward my entrants' scores.
- **[B]** B13 — Get a receipt confirming exactly what the portal accepted, so I have proof of submission if there's ever a dispute.
- **[B]** B15 — See my entrants' scores once the round closes (not before), so results are released fairly to everyone at once. _(school)_

### Ongoing engagement

- **[I]** I11 — Be reminded before a round opens and before it closes, so I don't miss the window.
- **[I]** I13 — Be notified when results are out, so I don't have to keep checking. _(school)_
- **[I]** I19 — Have a dashboard of all my entrants and their results, so I can see how my school is doing at a glance. _(school)_

---

## STUDENT (entrant)

### Sitting a paper

- **[I]** I1 — Sit a paper online instead of on paper, so I don't need a physical copy.
- **[I]** I2 — See a visible timer while sitting a paper, so I know how much time I have left.
- **[I]** I3 — Have my answers saved as I give them (not only on final submit), so I don't lose work.
- **[I]** I4 — Resume a sitting exactly where I left off if I lose connection, so a dropped connection doesn't cost me the attempt.
    - _Note: needs a server-side authoritative timer, not a client-side countdown, or a refresh could unfairly "reset" time._

### Access & results

- **[I]** I18 — Have my own login to sit papers and see my results, so I don't depend on my educator for access.
- **[I]** I17 — Get a certificate if I've earned one, so I have something to show for my result.

### Recourse

- **[I]** I8 — Request a remark on my result, so I have recourse if I think a mark is wrong.
- **[A]** A12 — Appeal a mark, so I have a formal route to challenge a result I disagree with.

---

## SYSTEM / SUPPORTING ROLES (not directly user-facing, but essential to design and assign)

### System — round lifecycle & integrity

- **[B]** B6 — Move a round automatically between states at its configured times, so no one has to press a button.
- **[B]** B14 — Mark a multiple-choice submission against its memo immediately on submission, so marking doesn't bottleneck on manual work.
- **[A]** A1 — Handle every round-open and round-close event correctly even under peak simultaneous load.
- **[A]** A2 — Judge a submission against one authoritative clock, so "on time" means the same thing regardless of timezone.
- **[A]** A3 — Count a submission exactly once no matter how many times it's retried.

### System — progression & automation

- **[I]** I10 — Carry qualifying entrants into the next round automatically, so the organiser doesn't rebuild entrant lists by hand.
- **[I]** I12 — Follow up with schools whose submission hasn't arrived, so late-running schools get a nudge before the deadline.
- **[I]** I5 — Queue any non-multiple-choice answer for a human marker, so free-response questions can still be marked.

### System — question bank & unified routes

- **[A]** A6 — Give different entrants different variants of a paper, so answer-sharing is harder.
- **[A]** A7 — Mark an entrant against the exact variant they sat, not a generic key.
- **[A]** A8 — Derive each question's difficulty from how entrants actually answered it.
- **[A]** A10 — Merge online and offline results into one result set per entrant.
- **[A]** A11 — Detect and reconcile an entrant who appears via both routes, so they're not double-counted.
- **[A]** A14 — Carry a successful appeal's outcome through into the standings automatically.

### Marker / Moderator / Reviewer

- **[I]** I6 — As a marker, award partial credit on a queued answer, so marking reflects partially-correct work.
- **[I]** I7 — As a moderator, review a sample of a marker's marking, so marking stays consistent across markers.
- **[A]** A13 — As a reviewer, have an appeal routed to me for a decision, so appeals don't sit unassigned.

### Platform (any user / the team)

- **[P]** P1 — Sign up, sign in, reset my password, and delete my account.
- **[P]** P2 — Use a responsive, accessible portal on any device.
- **[P]** P3 — As a developer, have the API hand-written and documented, so the team fully understands and controls its behaviour.
- **[P]** P5 — As a new team member or evaluator, have a public documentation site to understand the system without asking the team directly.

---

## Quick role → domain-owner mapping (from the pipeline doc)

| Role section                              | Primarily built by                                                   |
| ----------------------------------------- | -------------------------------------------------------------------- |
| Organiser                                 | Person B (Organiser Console) + Person A (lifecycle rules underneath) |
| Educator                                  | Person C (Educator Portal)                                           |
| Student                                   | Person E (Online Sitting)                                            |
| System — lifecycle & integrity            | Person A                                                             |
| System — progression, automation, marking | Person D + Person F                                                  |
| Marker/Moderator/Reviewer                 | Person D                                                             |
| Platform                                  | Person F (docs, CI/CD, integration) + Person B (auth)                |
