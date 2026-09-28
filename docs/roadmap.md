# Project Roadmap — Olympiad Portal

> **Team:** Prompt Engineers
> **Version:** 1.2
> **Last updated:** 28 September 2026

---

## Overview

This roadmap maps all user stories across four sprints. Progress is tracked on Trello. Sprint statuses: Done, In Progress, Planned, Blocked.

Statuses here are checked against the code on `main`, not against commit messages. `docs/implementation-status.html` has the evidence for each story and the open defects.

```
Week  1    2    3    4    5    6    7    8    9   10   11   12
      |-----------||-----------||-----------||-----------|
      |  SPRINT 1 ||  SPRINT 2 ||  SPRINT 3 ||  SPRINT 4 |
      | B-tier +  || I-tier +  || A-tier +  || Polish +  |
      | Auth      || Online    || Advanced  || Testing   |
      |           || Sitting   || Features  ||           |
```

### Status at a glance (28 September 2026)

| Sprint                   | Done   | In Progress | Planned |
| ------------------------ | ------ | ----------- | ------- |
| Sprint 1 — Foundation    | 18     | 0           | 0       |
| Sprint 2 — Core Features | 17     | 0           | 0       |
| Sprint 3 — Advanced      | 15     | 1           | 4       |
| Sprint 4 — Polish and QA | 1      | 3           | 0       |
| **Total (59 stories)**   | **51** | **4**       | **4**   |

---

## Sprint 1 — Foundation (B-tier + Authentication)

**Goal:** Working MVP with authentication, core CRUD, round lifecycle, and dashboard shells.

### Stories

| ID  | Story                                            | Status |
| --- | ------------------------------------------------ | ------ |
| P1  | Sign up, sign in, reset password, delete account | Done   |
| B1  | Create olympiad and define rounds                | Done   |
| B2  | Register schools against an olympiad             | Done   |
| B3  | Register educators for a school                  | Done   |
| B4  | Register entrants for a round                    | Done   |
| B5  | Set opening/closing time for a round             | Done   |
| B6  | Auto-transition round states                     | Done   |
| B7  | Prevent paper download before round opens        | Done   |
| B8  | Prevent result submission after round closes     | Done   |
| B9  | Upload round paper and memo                      | Done   |
| B10 | Auto-archive past papers on release              | Done   |
| B11 | Download current and archived papers             | Done   |
| B12 | Upload school results within open window         | Done   |
| B13 | Get submission receipt confirmation              | Done   |
| B14 | Auto-mark MCQ submissions                        | Done   |
| B15 | Release entrant scores after round closes        | Done   |
| B16 | Organiser console with live round state          | Done   |
| B17 | Single place for papers, results, submissions    | Done   |

### Deliverables

- Authentication (open sign-up for every role; schools join an olympiad by accepting an in-app invitation)
- CRUD for olympiads, rounds, schools
- Paper upload/download with time-gating
- MCQ auto-marking
- Round lifecycle state machine
- Dashboard shells
- Deployed to Azure App Service + Azure Storage + Supabase

### Dependencies

- Supabase project: Done
- Express API skeleton: Done
- Auth middleware: Done
- Prisma schema: Done

---

## Sprint 2 — Core Features (I-tier + Online Sitting)

**Goal:** Students sit papers online with timer and auto-save. Full dashboards. Notification system. Unit tests and CI/CD.

### Stories

| ID  | Story                                        | Status |
| --- | -------------------------------------------- | ------ |
| I1  | Sit a paper online                           | Done   |
| I2  | Visible timer during sitting                 | Done   |
| I3  | Auto-save answers as given                   | Done   |
| I4  | Resume sitting after connection loss         | Done   |
| I5  | Queue non-MCQ for human marking              | Done   |
| I8  | Request a remark                             | Done   |
| I9  | Set qualifying threshold                     | Done   |
| I10 | Auto-carry qualifying entrants to next round | Done   |
| I11 | Remind before round opens/closes             | Done   |
| I12 | Follow up with non-submitting schools        | Done   |
| I13 | Notify when results released                 | Done   |
| I14 | Configure notification rules                 | Done   |
| I15 | Test rules before go-live                    | Done   |
| I16 | Standings per school and per entrant         | Done   |
| I17 | Get a certificate if earned                  | Done   |
| I18 | Student login for papers and results         | Done   |
| I19 | Educator dashboard of entrants and results   | Done   |

### Deliverables

- Online paper sitting interface (timer, navigator, auto-save, flag)
- Server-authoritative timer
- Reconnection support
- Human marking queue
- Remark request workflow
- Automatic progression
- Notification engine (in-app notifications, delivered by the round lifecycle job)
- Standings at school and entrant level
- Downloadable PDF certificates for qualifying learners
- Unit test suite
- CI/CD pipeline (Gitea Actions)

---

## Sprint 3 — Advanced Features (A-tier)

**Goal:** Full product capability — question bank, variants, multi-olympiad, hybrid submissions, appeals, audit log.

### Stories

| ID  | Story                                       | Status      | Notes                                                                                                         |
| --- | ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| A1  | Handle round open/close under peak load     | Planned     | No load testing yet                                                                                           |
| A2  | Authoritative clock per olympiad timezone   | Done        | Round times are entered and shown in the olympiad's own timezone |
| A3  | Count submission exactly once (idempotency) | Done        |                                                                                                               |
| A4  | Consistent deadline boundary handling       | Done        | The closing instant is exclusive on both routes; every ruling is recorded with its reason                     |
| A5  | Papers from question bank                   | Done        | Organisers reuse questions from their earlier rounds; each question is listed once and can't go on a paper twice |
| A6  | Different variants per entrant              | Done        | Every entrant sits their own shuffled question and option order; layouts stay distinct per round until permutations run out |
| A7  | Mark against entrant's variant              | Done        | Displayed answers are canonicalised back to the shared key before marking, online submit and round marking both |
| A8  | Difficulty from performance data            | Done        | 1 − average score ÷ max points over marked answers, shown on exam review and in the question bank            |
| A9  | Paper sittable online or offline            | Done        | Paper results replace an online attempt the learner opened but never submitted                                |
| A10 | Merge online and offline results            | Done        | One result per learner, whichever route                                                                       |
| A11 | Reconcile dual-route entrants               | Done        | One submission per learner per round, enforced in the database                                                |
| A12 | Appeal a mark                               | Done        | A remark request is the appeal: one per released result, with a reason and a visible outcome                 |
| A13 | Route appeals to reviewer                   | Done        | Assigned by hand or evenly by workload, never to an educator from the learner's school                       |
| A14 | Appeal outcome updates standings            | Done        | A revised mark re-ranks the round and updates qualification and next-round entry                             |
| A15 | Multiple concurrent olympiads               | Done        | Each olympiad has its own schedule and timezone |
| A16 | Shared paper archive                        | Planned     | The archive is per olympiad                                                                                   |
| A17 | Log every automatic action                  | Done        | Automatic round actions are written to an append-only audit table                                            |
| A18 | Replay round event history                  | Done        | The organiser's Replay page shows a round's events and deadline rulings in order                              |
| I6  | Marker awards partial credit                | Done        |                                                                                                               |
| I7  | Moderator reviews marking consistency       | In Progress | Built and tested, but unusable in the app: only the organiser marks, and a marker can't moderate their own marking |

### Deliverables

- Question bank with tagging and difficulty calibration
- Paper generation and variant system
- Variant-aware marking
- Appeals pipeline with automatic standings update
- Partial credit and moderation
- Multi-olympiad with per-olympiad timezone
- Shared archive
- Online/offline hybrid with result merging
- Audit log and round replay
- Integration and component tests

---

## Sprint 4 — Polish and QA

**Goal:** Production-ready system. All bugs fixed. E2E tests. Documentation complete.

### Stories

| ID  | Story                                | Status      | Notes                                                                        |
| --- | ------------------------------------ | ----------- | ---------------------------------------------------------------------------- |
| P2  | Responsive, accessible on any device | In Progress | Responsive throughout; no accessibility audit yet                            |
| P3  | Hand-written, documented API         | Done        |                                                                              |
| P4  | External service integration         | In Progress | Notices are emailed through EmailJS; configured in production, not yet seen live |
| P5  | Public documentation site            | In Progress | Documentation is in `docs/` in the repository, not a published site         |

### Deliverables

- Bug bash sessions across all roles
- Accessibility audit (WCAG AA compliance)
- Load testing for concurrent round events
- End-to-end tests for critical flows
- Complete API documentation
- Updated README with setup and deployment guide
- Deployment hardening and environment documentation

---

## Change Log

| Date              | Change                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| September 2026    | Initial roadmap created                                                                                                                 |
| 27 September 2026 | Statuses brought in line with the code on `main`; I17 added to Sprint 2, where it was missing; notes added for stories still in progress |
| 27 September 2026 | A2 and A15 done: round times follow each olympiad's own timezone |
| 28 September 2026 | After PRs #53, #57 and #58: A4, A12–A14, A17 and A18 done; P4 now uses EmailJS, which still needs configuring in production |
| 28 September 2026 | A8 done: question difficulty from marked answers; the question bank lists each question once and can't put it on a paper twice; EmailJS configured in production |

This is a living document, reviewed at every Friday retrospective.
