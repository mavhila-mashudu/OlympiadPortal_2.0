# Olympiad Portal — API Reference

The backend is a hand-written Express (Node.js) REST API backed by PostgreSQL (Prisma ORM) and Supabase Auth/Storage.

- **Base URL (local dev):** `http://localhost:3000`
- **Content type:** `application/json` (except paper uploads, which use `multipart/form-data`)

## Conventions

### Response envelope

Every endpoint returns JSON with a consistent envelope:

```json
// success
{ "success": true, "data": { ... } }

// failure
{ "success": false, "error": "Human-readable error message" }
```

### Authentication

Protected endpoints require a Supabase access token in the `Authorization` header:

```
Authorization: Bearer <supabase-access-token>
```

Tokens are obtained by signing in through Supabase Auth (email + password). The backend verifies each token with Supabase, then loads the matching user row to determine role (`organiser`, `educator`, or `student`).

Missing/invalid token → `401`. Valid token but wrong role → `403`.

### Roles

| Role | Who | Typical access |
|---|---|---|
| `organiser` | Runs olympiads | Olympiad/round/paper/marking management |
| `educator` | School staff | Entrant registration, question management, offline submissions |
| `student` | Entrants | Sitting online exams, viewing own results |

---

## Health

### `GET /health`

Liveness probe. No auth.

```json
{ "status": "ok", "timestamp": "2026-09-14T10:00:00.000Z", "environment": "development" }
```

### `GET /`

API welcome message. No auth.

---

## Authentication & Registration

### `POST /auth/register/organiser`

Create an organiser account. Open registration — anyone may sign up as an organiser.

- **Auth:** none
- **Body:**

| Field | Type | Rules |
|---|---|---|
| `full_name` | string | required |
| `email` | string | required, valid email |
| `password` | string | required, ≥8 chars, ≥1 uppercase, ≥1 number |

- **Response `201`:** `data.user` — `{ id, full_name, email, role, created_at }`
- **Errors:** `409` email already registered

### `POST /auth/register`

Create an educator or student account using an invitation code or invite link token.

- **Auth:** none
- **Body:**

| Field | Type | Rules |
|---|---|---|
| `full_name` | string | required |
| `email` | string | required, valid email |
| `password` | string | required, same rules as above |
| `code` | string | invitation code (e.g. `SCH-ABC123`) |
| `invite_token` | string | token from an invite link |

One of `code` or `invite_token` is required. The invitation determines the resulting role and school linkage.

- **Response `201`:** `data.user` — `{ id, full_name, email, role, created_at }`
- **Errors:** `400` invalid/expired/already-used invitation; `409` email already registered

### `GET /auth/validate-code/:code`

Check an invitation code before signup. No auth. Returns invitation details (role, school, olympiad, expiry) or an error if the code is invalid, expired, or used.

### `GET /auth/validate-invite/:token`

Same as above but for email invite-link tokens. No auth.

### `GET /auth/me`

Current user profile.

- **Auth:** Bearer token (any role)
- **Response:** `data.user` with `school_memberships`, `educators`, and `entrants` relations for school context

### `DELETE /auth/account`

Soft-deletes the authenticated account. Cannot be undone.

- **Auth:** Bearer token (any role)
- **Response:** `data.message: "Account deleted"`

### `POST /auth/invite-school`

Invite a school to an olympiad. Creates the school, registers it for the olympiad, generates an invitation code, and emails the school contact.

- **Auth:** organiser
- **Body:** `school_name` (required), `contact_email` (required, valid email), `olympiad_id` (required)
- **Response `201`:** invitation details incl. generated code

### `POST /auth/invite-educator`

Invite another educator to the inviter's school.

- **Auth:** educator with `coordinator` school membership
- **Body:** `email` (required), `olympiad_id` (required)
- **Response `201`:** invitation details

### `POST /auth/invite-student`

Email a student an invitation.

- **Auth:** educator with `coordinator` or `educator` school membership
- **Body:** `email` (required), `olympiad_id` (required)
- **Response `201`:** invitation details

### `POST /auth/generate-student-codes`

Bulk-generate self-registration codes for entrants.

- **Auth:** educator
- **Body:** `count` (integer 1–200), `olympiad_id`
- **Response `201`:** `data.codes` — list of generated codes

### `GET /auth/educator-olympiads`

Olympiads the educator's school is registered for.

- **Auth:** educator
- **Response:** `data.olympiads`

### `GET /auth/student-invitations`

Student invitations issued by the educator's school.

- **Auth:** educator
- **Response:** `data.invitations`

---

## Olympiads

All olympiad endpoints are organiser-only and scoped to the organiser's own olympiads.

### `POST /olympiads`

- **Auth:** organiser
- **Body:** `name` (required), `timezone` (optional)
- **Response `201`:** `data.olympiad`

### `GET /olympiads`

List the organiser's olympiads.

### `GET /olympiads/:id`

Single olympiad. `404` if not found or not owned by caller.

### `PATCH /olympiads/:id`

Rename an olympiad.

- **Auth:** organiser (must own the olympiad)
- **Body:** `{ "name": "New Name" }` (required)
- **Response:** `data.olympiad`

### `DELETE /olympiads/:id`

Delete an olympiad. Fails with `400` if the olympiad has any rounds — delete the rounds first.

- **Auth:** organiser (must own the olympiad)
- **Response:** `data.message`

### `GET /olympiads/:olympiadId/schools`

Schools registered for the olympiad, incl. educator contacts and entrant counts.

### `GET /olympiads/:olympiadId/archive`

Closed rounds with downloadable paper/memo files.

---

## Rounds

### Create / list (nested under olympiad)

#### `POST /olympiads/:olympiadId/rounds`

- **Auth:** organiser (must own the olympiad)
- **Body:**

| Field | Type | Rules |
|---|---|---|
| `name` | string | required |
| `notes` | string | optional |
| `opens_at` | ISO 8601 date | required |
| `closes_at` | ISO 8601 date | required |
| `qualifying_threshold` | number ≥ 0 | optional |

- **Response `201`:** `data.round`; optional `data.warnings` (array of strings) when `opens_at` or `closes_at` falls on a SA public holiday — e.g. `"2026-12-16 falls on a public holiday: Day of Reconciliation"`. The round is still created; warnings are advisory only.

#### `GET /olympiads/:olympiadId/rounds`

List rounds for the olympiad.

#### `POST /rounds/check-dates`

Pre-flight holiday check. Call before creating or updating a round to surface public holiday clashes without persisting anything.

- **Auth:** organiser
- **Body:**

| Field | Type | Rules |
|---|---|---|
| `opens_at` | ISO 8601 date | optional |
| `closes_at` | ISO 8601 date | optional |

- **Response:** `data.warnings` — array of strings, e.g. `["2026-12-16 falls on a public holiday: Day of Reconciliation"]`. Empty array when no clashes.

> **External dependency:** Holiday data is fetched from [date.nager.at](https://date.nager.at) (free, no API key, `ZA` country code). If the external service is unreachable, warnings are silently skipped — the check never blocks round creation.

### Read / update / delete (standalone)

#### `GET /rounds/:id`

Round detail incl. state, timing, and paper info. Organiser must own the round.

#### `PATCH /rounds/:id`

Update round metadata. Same body fields as create, all optional. Response includes `data.warnings` (same shape as create) when dates fall on public holidays.

#### `PATCH /rounds/:id/state`

Transition the round lifecycle.

- **Auth:** organiser
- **Body:** `state` — one of `scheduled`, `open`, `closed`, `marking`, `results_released`
- **Response:** `data.round`

#### `DELETE /rounds/:id`

Delete the round and its dependent records.

#### `POST /rounds/:id/papers`

Upload the question paper and/or memo PDF for a round.

- **Auth:** organiser
- **Content type:** `multipart/form-data`
- **Fields:** `paper` (file, ≤20 MB), `memo` (file, ≤20 MB) — either or both
- **Storage:** files go to Supabase Storage (`papers` bucket); the DB stores the object paths
- **Response `201`:** `data.paper` — `{ id, round_id, title, file_url, memo_file_url, ... }`
- Re-uploading replaces the previous files (upsert).

---

## Notification Rules

Scheduled email rules for an olympiad (e.g. "notify all registered educators 60 minutes before a round closes"). Organiser-only, nested under olympiads.

### `GET /olympiads/:olympiadId/notification-rules`

### `POST /olympiads/:olympiadId/notification-rules`

- **Body:**

| Field | Type | Values |
|---|---|---|
| `name` | string | optional label |
| `trigger` | string | `round_opens`, `round_closes`, `results_released` |
| `offset_minutes` | integer ≥ 0 | minutes before/after trigger |
| `recipient` | string | `registered_educators`, `registered_schools`, `qualifying_entrants` |
| `condition` | string | optional filter expression |
| `enabled` | boolean | optional |

- **Response `201`:** `data.rule`

### `PATCH /olympiads/:olympiadId/notification-rules/:ruleId`

Update any subset of the fields above.

### `DELETE /olympiads/:olympiadId/notification-rules/:ruleId`

---

## Questions

Manage the question paper for a round. Both organisers and educators can manage questions (organiser ownership and educator school access are checked in the service layer).

### `POST /rounds/:roundId/questions`

- **Body:**

| Field | Type | Rules |
|---|---|---|
| `type` | string | `mcq`, `true_false`, `short_answer`, `essay` |
| `prompt` | string | required |
| `options` | string[] | for `mcq` / `true_false` |
| `correct_option` | string | comma-separated option indexes, e.g. `"0,2"`; no repeats. Multiple indexes → multi-select MCQ |
| `correct_answer` | string | expected answer for `short_answer` |
| `negative_pct` | number 0–100 | % of max points deducted per wrong MCQ selection (0 = off) |
| `max_points` | number ≥ 0.01 | points for a correct answer |

- **Response `201`:** `data.question`

### `GET /rounds/:roundId/questions`

### `PATCH /rounds/:roundId/questions/:id`

Same fields as create, all optional.

### `DELETE /rounds/:roundId/questions/:id`

---

## Exam Approval (Exam Status)

Two-stage verification before students can sit an online exam. Organiser-only.

### `GET /rounds/:roundId/exam-status`

- **Response:** `data` — `{ exam_status, state, question_count, questions_by_type, paper_id, approved_by, approved_at, approved_by_name }`

### `PATCH /rounds/:roundId/exam-status`

- **Body:** `status` — `draft`, `ready`, or `live`
- **Allowed transitions:**
  - `draft` → `ready` (requires ≥1 question on the paper)
  - `ready` → `draft` (un-approve)
  - `ready` → `live` (records approver + timestamp for the audit trail)
  - `live` → (terminal; no transitions out)

---

## Papers & Downloads

### `GET /papers/by-round/:roundId`

Signed, time-limited viewing URL (1 hour) for a round's paper or memo.

- **Auth:** organiser or educator
- **Query:** `type=paper` (default) or `type=memo`
- Organisers get both; educators get the paper only (the memo backs organiser verification).

### `GET /papers/:id/download`

Signed direct download URL (60 seconds). Organiser-only.

- **Query:** `type=paper` (default) or `type=memo`

---

## Submissions

### `POST /rounds/:roundId/submissions`

Create a submission on behalf of an entrant (offline/paper route).

- **Auth:** educator
- **Body:**

| Field | Type | Rules |
|---|---|---|
| `entrant_id` | UUID | required |
| `route` | string | `online` or `offline` (optional) |
| `answers` | array | required, ≥1 item — each `{ question_id: UUID, answer_value?: string }` |

- **Response `201`:** `data` — `{ submission, answers, totalPoints, autoMarked }`

### `GET /rounds/:roundId/submissions`

List submissions for a round.

- **Auth:** educator or organiser

### `GET /rounds/:roundId/submissions/:id`

Single submission with answers.

- **Auth:** educator or organiser

---

## Marking

All marking endpoints are organiser-only.

### `POST /rounds/:roundId/mark`

Bulk auto-mark all received submissions in the round (MCQ, true/false, short answer).

### `GET /rounds/:roundId/marking-queue`

Answers still awaiting manual marking (essays), grouped by submission, with the memo answer shown for comparison.

- **Response:** `data.submissions` — each `{ id, received_at, is_late, entrants: { full_name, grade }, answers: [...] }`

### `POST /rounds/:roundId/results`

Generate final results with ranks and qualification status. Requires all answers to be marked first.

### `PATCH /rounds/:roundId/answers/:id`

Manually mark a single answer.

- **Body:** `is_correct` (boolean, required), `points_awarded` (number ≥ 0, required)

---

## Student Portal

All student endpoints require the `student` role and an entrant profile linked to the account.

### `GET /rounds/registered`

Rounds the student is registered for, plus dashboard stats (entered count, results available, certificates).

### `GET /rounds/:roundId/details`

Detailed round info for the student (timing, paper availability, own result when released).

- **Param:** `roundId` must be a valid UUID

### `GET /rounds/my-results`

Released results for completed rounds, incl. score, percentage, and certificate availability.

---

## Sitting an Online Exam (Student)

The full sitting flow, all `student`-only. The round must be `open` and its exam status `live`, and the student must be registered for the round.

### `GET /rounds/:roundId/exam`

Round info plus the question list **stripped of all correct answers** (`correct_option` / `correct_answer` never leave the server). Includes:

- `multi_select` — how many correct options exist (not which), so the UI picks radio vs checkboxes
- `negative_pct` — so students know wrong selections cost marks
- `total_points`, `server_time` (for countdown clock-sync), and `submission` if one already exists (resume)

### `POST /rounds/:roundId/exam/start`

Create the submission and empty answer rows for every question. Idempotent — if an in-progress submission exists it is returned for resume; if already submitted → `400`.

- **Response `201`:** `data.submission` — `{ id, status, answers }`

### `PATCH /rounds/:roundId/exam/answers/:qid`

Auto-save a single answer as the student types.

- **Body:** `answer_value` (string, optional — omit to clear)

### `POST /rounds/:roundId/exam/submit`

Finalize the submission. Auto-marks MCQ/true-false (partial credit, negative marking) and short answers (case-insensitive match) inline; essays are left for the organiser's marking queue. Sets submission status to `automarked` or `queued_for_marking`, upserts the entrant's result row, and flags `is_late` if submitted after the round's close.

- **Response:** `data` — `{ message, status, total_points, is_late }`

---

## Error Codes

| Status | Meaning |
|---|---|
| `400` | Validation failure or invalid state transition (message explains which) |
| `401` | No/invalid/expired token, or account deleted |
| `403` | Authenticated but wrong role, or not the owner of the resource |
| `404` | Resource not found (or not owned by caller) |
| `409` | Conflict — e.g. email already registered, duplicate record |
| `500` | Unexpected server error |
