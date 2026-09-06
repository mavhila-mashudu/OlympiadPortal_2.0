# Project Roadmap — Olympiad Portal

> **Team:** Prompt Engineers
> **Version:** 1.0
> **Last updated:** September 2026

---

## Overview

This roadmap maps all user stories across four sprints. Progress is tracked on Trello. Sprint statuses: Done, In Progress, Planned, Blocked.

```
Week  1    2    3    4    5    6    7    8    9   10   11   12
      |-----------||-----------||-----------||-----------|
      |  SPRINT 1 ||  SPRINT 2 ||  SPRINT 3 ||  SPRINT 4 |
      | B-tier +  || I-tier +  || A-tier +  || Polish +  |
      | Auth      || Online    || Advanced  || Testing   |
      |           || Sitting   || Features  ||           |
```

---

## Sprint 1 — Foundation (B-tier + Authentication)

**Goal:** Working MVP with authentication, core CRUD, round lifecycle, and dashboard shells.

### Stories

| ID  | Story                                            | Status      |
| --- | ------------------------------------------------ | ----------- |
| P1  | Sign up, sign in, reset password, delete account | In Progress |
| B1  | Create olympiad and define rounds                | In Progress |
| B2  | Register schools against an olympiad             | In Progress |
| B3  | Register educators for a school                  | In Progress |
| B4  | Register entrants for a round                    | In Progress |
| B5  | Set opening/closing time for a round             | Done        |
| B6  | Auto-transition round states                     | In Progress |
| B7  | Prevent paper download before round opens        | In Progress |
| B8  | Prevent result submission after round closes     | In Progress |
| B9  | Upload round paper and memo                      | In Progress |
| B10 | Auto-archive past papers on release              | Planned     |
| B11 | Download current and archived papers             | In Progress |
| B12 | Upload school results within open window         | In Progress |
| B13 | Get submission receipt confirmation              | Planned     |
| B14 | Auto-mark MCQ submissions                        | In Progress |
| B15 | Release entrant scores after round closes        | Planned     |
| B16 | Organiser console with live round state          | In Progress |
| B17 | Single place for papers, results, submissions    | In Progress |

### Deliverables

- Authentication (organiser self-registration, invitation-based registration for educators/students)
- CRUD for olympiads, rounds, schools
- Paper upload/download with time-gating
- MCQ auto-marking
- Round lifecycle state machine
- Dashboard shells
- Deployed to Render + Vercel + Supabase

### Dependencies

- Supabase project: Done
- Express API skeleton: Done
- Auth middleware: Done
- Prisma schema: Done

---

## Sprint 2 — Core Features (I-tier + Online Sitting)

**Goal:** Students sit papers online with timer and auto-save. Full dashboards. Notification system. Unit tests and CI/CD.

### Stories

| ID  | Story                                        | Status  |
| --- | -------------------------------------------- | ------- |
| I1  | Sit a paper online                           | Planned |
| I2  | Visible timer during sitting                 | Planned |
| I3  | Auto-save answers as given                   | Planned |
| I4  | Resume sitting after connection loss         | Planned |
| I5  | Queue non-MCQ for human marking              | Planned |
| I8  | Request a remark                             | Planned |
| I9  | Set qualifying threshold                     | Planned |
| I10 | Auto-carry qualifying entrants to next round | Planned |
| I11 | Remind before round opens/closes             | Planned |
| I12 | Follow up with non-submitting schools        | Planned |
| I13 | Notify when results released                 | Planned |
| I14 | Configure notification rules                 | Planned |
| I15 | Test rules before go-live                    | Planned |
| I16 | Standings per school and per entrant         | Planned |
| I18 | Student login for papers and results         | Planned |
| I19 | Educator dashboard of entrants and results   | Planned |

### Deliverables

- Online paper sitting interface (timer, navigator, auto-save, flag)
- Server-authoritative timer
- Reconnection support
- Human marking queue
- Remark request workflow
- Automatic progression
- Notification engine
- Standings at school and entrant level
- Unit test suite
- CI/CD pipeline (Gitea Actions)

---

## Sprint 3 — Advanced Features (A-tier)

**Goal:** Full product capability — question bank, variants, multi-olympiad, hybrid submissions, appeals, audit log.

### Stories

| ID  | Story                                       | Status               |
| --- | ------------------------------------------- | -------------------- |
| A1  | Handle round open/close under peak load     | Planned              |
| A2  | Authoritative clock per olympiad timezone   | Planned              |
| A3  | Count submission exactly once (idempotency) | In Progress (schema) |
| A4  | Consistent deadline boundary handling       | Planned              |
| A5  | Papers from question bank                   | Planned              |
| A6  | Different variants per entrant              | Planned              |
| A7  | Mark against entrant's variant              | Planned              |
| A8  | Difficulty from performance data            | Planned              |
| A9  | Paper sittable online or offline            | Planned              |
| A10 | Merge online and offline results            | Planned              |
| A11 | Reconcile dual-route entrants               | Planned              |
| A12 | Appeal a mark                               | Planned              |
| A13 | Route appeals to reviewer                   | Planned              |
| A14 | Appeal outcome updates standings            | Planned              |
| A15 | Multiple concurrent olympiads               | Planned              |
| A16 | Shared paper archive                        | Planned              |
| A17 | Log every automatic action                  | Planned              |
| A18 | Replay round event history                  | Planned              |
| I6  | Marker awards partial credit                | Planned              |
| I7  | Moderator reviews marking consistency       | Planned              |

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

| ID  | Story                                | Status      |
| --- | ------------------------------------ | ----------- |
| P2  | Responsive, accessible on any device | In Progress |
| P3  | Hand-written, documented API         | In Progress |
| P4  | External service integration         | Planned     |
| P5  | Public documentation site            | Planned     |

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

| Date           | Change                  |
| -------------- | ----------------------- |
| September 2026 | Initial roadmap created |

This is a living document, reviewed at every Friday retrospective.
