# Comprehensive Development Plan — Olympiad Portal

> **Team:** Prompt Engineers
> **Version:** 1.0
> **Last updated:** September 2026

---

## 1. Project Overview

The Olympiad Portal is a web platform that digitises academic olympiad competitions between schools. It replaces paper-based administration with role-based dashboards for organisers, educators, and students.

**Problem:** Olympiad administration relies on printing papers, manual distribution, physical answer collection, hand-marking, and compiling results in spreadsheets. This is slow, error-prone, and difficult to scale.

**Scope:** Three role-based dashboards covering olympiad creation, school registration, paper distribution, result submission, automated marking, and results release.

**Out of scope:** Payment processing, video proctoring, native mobile apps, OMR scanning, multi-language support.

---

## 2. Team Structure

| #   | Name                 | Primary Role        | Additional Responsibilities                      |
| --- | -------------------- | ------------------- | ------------------------------------------------ |
| 1   | Mashudu Mavhila      | Student Dashboard   | MVP architecture, CI/CD pipeline, DevOps         |
| 2   | Nhlakanipho Mavefua  | Student Dashboard   | Work tracker (Trello), sprint planning           |
| 3   | Madimabe Manenzhe    | Educator Dashboard  | Authentication system, API routes                |
| 4   | Engedzani Mutambedzo | Educator Dashboard  | Documentation lead                               |
| 5   | Kedibone Mnisi       | Organiser Dashboard | Prisma schema, database migrations, data seeding |
| 6   | Andile Dudu          | Organiser Dashboard | UML diagrams, visual design                      |

### Communication

- **Monday:** Sprint planning and task allocation
- **Wednesday:** Mid-week progress and blockers
- **Friday:** Demo completed work, retrospective, update Trello
- **Trello:** Continuous task tracking (Backlog, To Do, In Progress, Review, Done)
- **WhatsApp:** Ad-hoc communication
- **Gitea PRs:** Code review before merging

---

## 3. Methodology

### Agile + Scrum

We use Agile with Scrum as the delivery framework:

1. **Iterative delivery for a 4-sprint project.** Each sprint maps to a rubric assessment point. Time-boxed sprints deliver working increments independently, avoiding a single end-of-project failure.

2. **Evolving requirements.** User stories are defined upfront but implementation details become clearer as we build. Agile allows refinement between sprints without re-planning.

3. **Team size fits Scrum.** Scrum recommends 3-9 developers. Our 6-person team parallelises work across three dashboard streams while maintaining direct communication.

4. **Pragmatic ceremonies.** Monday/Wednesday/Friday meetings replace daily stand-ups (impractical for a student team with other courses) while providing structured touchpoints.

5. **Trello as product backlog.** Columns for Backlog, To Do, In Progress, Review, Done. The team collectively prioritises items before each sprint.

6. **Retrospectives drive improvement.** Friday reviews include what went well, what did not, and what to change — feeding into the next sprint.

### Sprint Structure

| Sprint | Weeks | Focus                                     | Tier             |
| ------ | ----- | ----------------------------------------- | ---------------- |
| 1      | 1-3   | Authentication, CRUD, round lifecycle     | B (Basic)        |
| 2      | 4-6   | Online sitting, notifications, dashboards | I (Intermediate) |
| 3      | 7-9   | Question bank, variants, appeals          | A (Advanced)     |
| 4      | 10-12 | Polish, bug fixes, testing                | QA               |

---

## 4. Sprint 1 Detail (B-tier + Authentication)

| ID  | Story                                            | Status      |
| --- | ------------------------------------------------ | ----------- |
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
| P1  | Sign up, sign in, reset password, delete account | In Progress |

### Sprint 1 Deliverables

- Working authentication (organiser self-registration, invitation-based registration for educators and students)
- CRUD for olympiads, rounds, and schools
- Paper upload and download with time-gating
- MCQ auto-marking
- Round lifecycle state machine (scheduled, open, closed, marking, results_released)
- Role-based dashboard shells
- Database schema deployed to Supabase

---

## 5. Technical Environment

### Development Tools

| Tool                      | Purpose                              |
| ------------------------- | ------------------------------------ |
| VS Code / Qoder IDE       | Code editor with TypeScript support  |
| Gitea (sdp.ms.wits.ac.za) | Primary Git host, code review, CI    |
| Gitea Actions             | CI and deployment to Azure           |
| Trello                    | Sprint board and backlog             |
| Lovable                   | UI prototyping (see UI Design doc)   |
| Supabase Dashboard        | Database management, auth monitoring |

### Tech Stack (with justifications)

| Layer         | Technology            | Why                                                                              |
| ------------- | --------------------- | -------------------------------------------------------------------------------- |
| Frontend      | React 19 + Vite 8     | Component model for dashboard reuse; Vite provides fast HMR and optimised builds |
| Routing       | React Router 7        | Standard React SPA routing with nested routes for dashboards                     |
| Data fetching | TanStack React Query  | Server state caching, background refetch, optimistic updates                     |
| Icons         | Lucide React          | Tree-shakeable, consistent icon library                                          |
| Backend       | Express 5             | Widely used Node.js framework with large middleware ecosystem                    |
| ORM           | Prisma 7              | Type-safe queries, auto-generated types, version-controlled migrations           |
| Database      | PostgreSQL (Supabase) | ACID compliance for competition data; managed hosting with backups               |
| Auth          | Supabase Auth         | Managed JWT authentication, email/password flow, session management              |
| Security      | Helmet + CORS         | HTTP security headers and origin restriction                                     |
| Validation    | express-validator     | Declarative request validation with sanitisation                                 |
| File upload   | Multer                | Handles multipart/form-data for PDF paper uploads                                |
| Real-time     | ws (WebSocket)        | Live round state updates for organiser console                                   |
| Linting       | Oxlint                | Rust-based linter, 50-100x faster than ESLint                                    |
| TypeScript    | TypeScript 6/7        | Static types for a 6-person team working on shared code                          |

### Deployment

| Service           | Component         | Why                                                                |
| ----------------- | ----------------- | ------------------------------------------------------------------ |
| Azure App Service | Backend API       | Linux Node 22 plan, deployed by Gitea Actions, automatic HTTPS     |
| Azure Storage     | Frontend SPA      | Static website hosting, deployed by Gitea Actions, automatic HTTPS |
| Supabase          | PostgreSQL + Auth | Managed database with backups, built-in auth service               |

---

## 6. Document History

| Version | Date           | Author               | Changes                  |
| ------- | -------------- | -------------------- | ------------------------ |
| 1.0     | September 2026 | Engedzani Mutambedzo | Initial development plan |
