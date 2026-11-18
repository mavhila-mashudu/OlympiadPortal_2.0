# System Design — Olympiad Portal

> **Team:** Prompt Engineers
> **Version:** 1.0
> **Last updated:** September 2026

---

## 1. Architecture

The Olympiad Portal uses a **multi-tier architecture** with three tiers deployed on separate managed services:

```
CLIENT TIER                    APPLICATION TIER               DATA TIER
React SPA (Vercel) --->  Express API (Render)   --->   PostgreSQL (Supabase)
Role-based dashboards          Routes > Controllers          Prisma ORM
React Router, React Query      > Services > Prisma           Supabase Auth
                               Helmet, CORS, WebSocket       Supabase Storage
```

### Why Multi-Tier

- **Separation of concerns:** Each tier handles one responsibility (presentation, business logic, data storage)
- **Independent scaling:** The frontend is static files served straight from Vercel; the backend scales on its Render plan; the database scales vertically on Supabase
- **Security boundaries:** The client never accesses the database directly; all data flows through the API tier which enforces authentication and authorisation

---

## 2. Backend Architecture

### Request Lifecycle

```
HTTP Request
  > Helmet (security headers)
  > CORS (origin validation)
  > Body parsing (JSON / URL-encoded)
  > Route matching
  > requireAuth middleware (validates Supabase JWT)
  > requireRole middleware (checks role: organiser/educator/student)
  > express-validator middleware (validates request body/params)
  > Controller (HTTP concerns)
  > Service (business logic)
  > Prisma ORM (database queries)
  > JSON Response
  > errorHandler (catches all errors, maps to HTTP status codes)
```

### Error Handling

Custom error hierarchy maps to HTTP status codes:

| Error Class     | Status | Use case                                   |
| --------------- | ------ | ------------------------------------------ |
| BadRequest      | 400    | Invalid input                              |
| Unauthorized    | 401    | Missing or expired JWT                     |
| Forbidden       | 403    | Insufficient role                          |
| NotFound        | 404    | Resource does not exist                    |
| Conflict        | 409    | Unique constraint violation (Prisma P2002) |
| ValidationError | 422    | Failed express-validator rules             |

All errors return `{ success: false, error: "message" }`. Stack traces are suppressed in production.

### API Routes

| Method | Path                                       | Role      | Purpose                        |
| ------ | ------------------------------------------ | --------- | ------------------------------ |
| POST   | /auth/register                             | Public    | Sign up as educator or student |
| GET    | /schools                                   | Public    | Schools for the signup form    |
| GET    | /me                                        | Any       | Get current user               |
| DELETE | /me                                        | Any       | Soft-delete account            |
| GET    | /me/rounds/:roundId                        | Any       | One round, by caller's role    |
| GET    | /me/rounds/:roundId/results                | Educator  | One round's results (school)   |
| GET    | /me/olympiad-invitations                   | Any       | Invitations addressed to me    |
| GET    | /me/sent-olympiad-invitations              | Staff     | Invitations I have sent        |
| GET    | /me/olympiad-invitation-candidates         | Staff     | Who I may still invite         |
| POST   | /olympiad-invitations                      | Staff     | Invite someone to an olympiad  |
| POST   | /olympiad-invitations/:invitationId/accept | Any       | Accept an invitation           |
| POST   | /olympiad-invitations/:invitationId/reject | Any       | Decline an invitation          |
| DELETE | /olympiad-invitations/:invitationId        | Staff     | Withdraw an invitation         |
| POST   | /olympiads                                 | Organiser | Create olympiad                |
| GET    | /olympiads                                 | Organiser | List olympiads                 |
| GET    | /olympiads/:olympiadId                     | Organiser | Get olympiad detail            |
| GET    | /olympiads/:olympiadId/schools             | Organiser | List registered schools        |
| GET    | /olympiads/:olympiadId/papers/archive      | Organiser | List archive (one olympiad)    |
| POST   | /olympiads/:olympiadId/entrants            | Educator  | Register entrants              |
| GET    | /olympiads/:olympiadId/entrants            | Educator  | List olympiad entrants         |
| GET    | /olympiads/:olympiadId/progression         | Educator  | Qualification funnel           |
| POST   | /olympiads/:olympiadId/rounds              | Organiser | Create round                   |
| GET    | /olympiads/:olympiadId/rounds              | Organiser | List rounds                    |
| GET    | /rounds/:roundId                           | Organiser | Get round detail               |
| POST   | /rounds/:roundId/entrants                  | Educator  | Register entrants              |
| GET    | /rounds/:roundId/entrants                  | Educator  | List round entrants            |
| GET    | /rounds/:roundId/progression               | Educator  | Qualification funnel           |
| GET    | /rounds/:roundId/papers/preview            | Edu/Org   | Signed paper/memo preview      |
| GET    | /rounds/:roundId/papers/download           | Edu/Stud  | Paper download link (signed)   |
| GET    | /rounds/:roundId/papers/archive            | Educator  | Past papers for the round      |
| PATCH  | /rounds/:roundId                           | Organiser | Update round                   |
| DELETE | /rounds/:roundId                           | Organiser | Delete round                   |
| POST   | /rounds/:roundId/papers                    | Organiser | Upload paper and memo          |
| GET    | /papers/archive                            | Organiser | Shared past-paper archive      |
| GET    | /papers/:paperId/download                  | Organiser | Download paper file            |
| POST   | /rounds/:roundId/auto-mark                 | Edu/Org   | Bulk auto-mark submissions     |
| POST   | /rounds/:roundId/results                   | Organiser | Generate final results         |
| PATCH  | /rounds/:roundId/answers/:answerId         | Edu/Org   | Manually mark answer           |
| POST   | /rounds/:roundId/submissions               | Educator  | Create submission              |
| GET    | /rounds/:roundId/submissions               | Edu/Org   | List submissions               |
| GET    | /rounds/:roundId/submissions/:submissionId | Edu/Org   | Get submission detail          |

---

## 3. Database Design

### Entity-Relationship Diagram

```
users ─────┬──── olympiad_invites
           ├──── olympiads ────── rounds ────┬──── papers ────── questions
           │              │                  │                     │
           │              │                  ├──── submissions ──── answers
           │              │                  │
           │              │                  └──── results
           │              │
           │              └──── school_registrations ──── schools ────┬──── educators
           │                                                          │
           └──── entrants ───── entrant_registrations ────────────────┘
```

### Models (24 total)

The Prisma schema defines these 24 models, which map to PostgreSQL tables:

| Model | Purpose |
| --- | --- |
| `users` | Organiser, educator, and student accounts |
| `olympiad_invites` | In-app invitations to join an olympiad |
| `schools` | School records |
| `school_invitations` | Email invitations and single-use codes for school membership |
| `school_memberships` | User roles and membership status within a school |
| `educators` | Educator profiles linked to schools |
| `entrants` | Student participants and their school details |
| `olympiads` | Competition records and organiser ownership |
| `notification_rules` | Rules for sending competition notifications |
| `sent_notifications` | Records used to prevent duplicate email delivery |
| `school_registrations` | School participation in an olympiad |
| `rounds` | Competition stages, schedules, and lifecycle state |
| `papers` | Round papers and marking memos |
| `questions` | Question content and answer configuration |
| `answers` | Student answers and awarded marks |
| `submissions` | Online and offline exam submissions |
| `exam_assignments` | Per-student exam question and option ordering |
| `entrant_registrations` | Student registration for competition rounds |
| `results` | Scores, ranks, and qualification outcomes |
| `remark_requests` | Requests to review a result |
| `portal_notifications` | In-app notifications and read status |
| `marking_reviews` | Changes and comments on awarded marks |
| `round_events` | Append-only round lifecycle audit events |
| `submission_deadline_decisions` | Decisions about submissions at round deadlines |

See [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma) for fields, relationships, indexes, and constraints.
### Enums

| Enum              | Values                                                      |
| ----------------- | ----------------------------------------------------------- |
| user_role         | organiser, educator, student                                |
| invite_status     | pending, accepted, rejected                                 |
| round_state       | scheduled, open, closed, marking, results_released          |
| submission_route  | online, offline                                             |
| submission_status | received, automarked, queued_for_marking, marked, moderated |

### Design Decisions

- **UUIDs** for all primary keys — prevents enumeration, safe in URLs
- **Soft delete** on users (deleted_at column) — preserves referential integrity
- **timestamptz(6)** on all timestamps — timezone-aware precision for deadlines
- **Composite unique constraints** — submissions(round_id, entrant_id, route) prevents duplicates; entrant_registrations(entrant_id, round_id) prevents double registration
- **Indexes** — rounds(state, opens_at, closes_at) for lifecycle queries; results(round_id, rank) for leaderboards
- **Idempotency key** on submissions — prevents double-submission on network retries

---

## 4. Core Behaviours

### Authentication Flow

Registration is open to everyone: invitations are optional for educators and students. School access is either approved manually or granted by an authorised email-bound signup code.

1. **Sign-up:** POST /auth/register with a role of educator or student (organisers are provisioned by the administrator). It creates the Supabase Auth user and the users row, plus an educators row and school membership for an educator, or an entrant row for a student.
2. **Choosing a school:** educators and students pick from GET /schools. An educator whose school is not listed may name a new one. A student must pick an existing school.
3. **Approval (no invitation code):** a new educator's membership is `pending`. An organiser approves the first coordinator of a school; that coordinator approves later educators and all students. Until then the person can log in but only sees a "waiting for approval" page.
4. **Invitation code (educators or students):** an organiser can invite an educator at a selected school, including a first coordinator. An active school educator (coordinator or ordinary educator) can invite educators and students to their **own school** using POST /school-invitations. A recipient signs up with the emailed address, matching account type and one-use code, gaining active school access without waiting. Student invitations create a new entrant only, never link an existing record by name. Codes expire after 7 days and only hashes are stored. A bad code is rejected rather than falling back to approval. EmailJS delivers the invitation, and the signup link uses FRONTEND_URL.
5. **Joining an olympiad (organiser to educator):** the organiser sends an in-app invitation to an educator. It appears on the educator's dashboard; accepting registers their school for the olympiad.
6. **Joining an olympiad (educator to student):** the educator invites a student of their own school. Accepting enters that student into every round still taking registrations.

All API requests include `Authorization: Bearer <access_token>`. The requireAuth middleware validates the JWT via Supabase. The requireRole middleware checks user.role.

### Round Lifecycle State Machine

```
scheduled  >  open  >  closed  >  marking  >  results_released
```

- **scheduled:** Round created, opens_at is in the future. No access to papers.
- **open:** opens_at reached. Papers downloadable, submissions accepted, online sitting available.
- **closed:** closes_at reached. No more submissions. Papers locked.
- **marking:** Organiser triggers auto-mark. MCQ scored automatically; non-MCQ queued for human marking.
- **results_released:** Scores visible. Papers auto-archived. Qualified entrants identified.

Transitions from scheduled to open and open to closed are automatic, driven by a lifecycle service that queries rounds where the current time has passed the configured threshold.

### Auto-Marking Pipeline

1. Fetch all submissions with status=received for the round
2. For each submission, iterate over answers
3. MCQ answers: compare answer_value to correct_option, award max_points or 0
4. Non-MCQ answers: set submission status to queued_for_marking for human review
5. Update submission status to automarked or queued_for_marking

### Submission Idempotency

The composite unique constraint on (round_id, entrant_id, route) plus a unique idempotency_key ensures each submission is counted exactly once, even if the request is retried due to network issues.

---

## 5. Security

| Area             | Implementation                                                     |
| ---------------- | ------------------------------------------------------------------ |
| Passwords        | Min 8 chars, uppercase letter, number required                     |
| JWT              | Managed by Supabase Auth; access tokens expire after 1 hour        |
| HTTP headers     | Helmet sets CSP, HSTS, X-Content-Type-Options, X-Frame-Options     |
| CORS             | Restricted to one origin in production: the Vercel site     |
| Input validation | express-validator on all routes with sanitisation                  |
| SQL injection    | Prevented by Prisma parameterised queries                          |
| File upload      | Multer with size limits; PDF only for papers/memos                 |
| Enumeration      | UUIDs prevent sequential ID guessing                               |
| Access control   | requireRole on every protected route                               |
| Time-gating      | Papers locked before opens_at; submissions blocked after closes_at |
| Results embargo  | Scores only visible when round state is results_released           |

---

## 6. Backlog Feature Design (Not Yet Implemented)

### Online Paper Sitting (Sprint 2)

Students sit papers in the browser with a server-authoritative timer. The remaining time is calculated from round.closes_at minus submission.received_at on the server, not a client-side countdown. This prevents timer manipulation via page refresh.

Answers are auto-saved on each change via debounced PATCH requests. On reconnection after a dropped connection, the frontend fetches the submission, pre-fills saved answers, and resumes the server-calculated timer.

The interface includes a question navigator showing answered, unanswered, and flagged questions, with Previous/Next navigation and a flag-for-review toggle.

### Notification System (Sprint 2)

Organisers configure notification rules with three components: trigger (e.g., "round opens in 24h"), recipient (e.g., "all registered educators"), and channel (email). A scheduler checks upcoming events against configured rules and dispatches notifications.

Rules can be dry-run tested against a past round before activation.

### Human Marking Queue (Sprint 2-3)

Non-MCQ answers are queued with status=queued_for_marking. Markers see a queue sorted by round and question, award partial credit (0 to max_points), and progress through the queue. Moderators sample a percentage of each marker's work for consistency review.

### Progression and Standings (Sprint 2-3)

After results are generated, entrants whose total_points meet the qualifying_threshold are automatically registered for the next round (no manual re-registration). Standings are published at both individual and school level.

### Question Bank and Variants (Sprint 3)

A central question repository tagged by subject, difficulty, topic, and type. Papers can be generated from the bank with balanced difficulty. Variants give different entrants different question orders or equivalent questions, and marking uses each entrant's specific variant key.

Question difficulty is derived from actual performance data: difficulty = 1 - (average score / max points).

### Appeals Pipeline (Sprint 3)

Students request a remark, which creates an appeal assigned to a reviewer. If upheld, marks are adjusted, results recalculated, ranks recomputed, and qualification status rechecked automatically.

### Multi-Olympiad Support (Sprint 3)

A single organiser account manages multiple concurrent olympiads, each with its own timezone setting. The authoritative clock for deadline enforcement uses the olympiad's timezone. All olympiads share a single archive of past papers.

### Online/Offline Hybrid (Sprint 3)

The same paper is available both online (browser sitting) and offline (downloaded PDF administered on paper). Offline results are uploaded by the educator. Both routes merge into a single result set per entrant. If an entrant appears via both routes, the system flags it for organiser review.

### Audit Log and Replay (Sprint 3)

Every automatic action (round transitions, auto-marking, progression, notifications) is logged with timestamp, action type, actor, and details. Given a round_id, the full event history can be replayed for dispute investigation.

---

## 7. Deployment Architecture

```
Internet
  |
  +---> Vercel static website ---> React SPA (built assets)
  |         Vercel deployment URL
  |
  +---> Render (Linux, Node 22) ---> Express API
            olympiad-portal-api.onrender.com
              |
              +---> Supabase ---> PostgreSQL + Auth + Storage
```

The frontend is deployed to Vercel, which serves the built single-page
application. The backend is deployed to Render from the repository's Docker
configuration. GitHub Actions runs the code checks; the hosting providers use
their repository integrations for deployment.

Configuration is held where it is used, not duplicated:

- Backend (Render environment): NODE_ENV, DATABASE_URL, DIRECT_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FRONTEND_URL
- Frontend (baked in at build time by Vite): VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

`FRONTEND_URL` must match the Vercel site's URL exactly, since production CORS
admits that single origin and nothing else.

---
