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

Missing/invalid token → `401`. Valid token but wrong role → `403`. The frontend treats a `401` on a request that carried a token as the end of the session (expired, logged out elsewhere, or account deleted) and returns the user to the login page.

Every response carries `Cache-Control: no-store`, so browsers never keep personal data (names, answers, marks) on disk or show it again after logout.

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

Registration is open: anyone may sign up in any role, and no invitation code
is involved. Educators and students say which school they belong to when they
sign up; taking part in a particular olympiad is then arranged through the
in-app invitations below.

### `POST /auth/register`

Create an account in any role.

- **Auth:** none
- **Body:**

| Field | Type | Rules |
|---|---|---|
| `full_name` | string | required |
| `email` | string | required, valid email |
| `password` | string | required, >=8 chars, >=1 uppercase, >=1 number |
| `role` | string | required, one of `organiser`, `educator`, `student` |
| `school_id` | uuid | required for a student; optional for an educator |
| `school_name` | string | educator only, when their school is not listed yet |

An educator supplies either `school_id` (a school already on the platform) or
`school_name` (a new one, matched case-insensitively against existing schools
before being created). The first educator at a school becomes its
`coordinator`; later ones join as `educator`. A student must supply
`school_id`, and is linked to an entrant record at that school — claiming the
unclaimed entrant an educator already listed under the same name, if there is
one.

- **Response `201`:** `data.user` - `{ id, full_name, email, role, created_at }`
- **Errors:** `400` missing/invalid school; `404` school not found; `409` email already registered

### `POST /auth/register/organiser`

Registers an organiser. Kept so existing sign-up links keep working; the body
is `full_name`, `email` and `password`, and the behaviour matches
`POST /auth/register` with `role: "organiser"`.

### `GET /auth/schools`

The schools on the platform, as `{ id, name }` ordered by name. No auth: the
signup form needs it before anyone has an account.

- **Response:** `data.schools`

### `POST /auth/forgot-password`

Emails a password reset link. Supabase makes the one-time link without sending
anything, and the portal emails it through EmailJS, because Supabase's own
sender allows only a few emails an hour for the whole project. The link opens
`/reset-password?token_hash=…&type=recovery`, where the browser exchanges the
token with Supabase and sets the new password. If EmailJS isn't configured, or
can't deliver, Supabase's sender is used instead.

- **Auth:** none (rate limited per client IP, like the other public auth endpoints)
- **Body:** `email` (required, valid email)
- **Response:** `data.message` — always "If an account exists for that address,
  a reset link is on its way.", so the endpoint can't be used to find out who
  has an account. Nothing is sent to an unknown or deleted account, and at most
  one email a minute goes to the same address.
- **Errors:** `422` invalid email; `429` too many requests

### `GET /auth/me`

Current user profile.

- **Auth:** Bearer token (any role)
- **Response:** `data.user` with `school_memberships`, `educators`, and `entrants` relations for school context

### `POST /auth/logout`

Ends the session the request's token belongs to. Supabase revokes it, so it can't be refreshed or used again, and the server stops accepting the token at once. The frontend calls this before forgetting the token; if Supabase can't be reached the logout still succeeds, and the failure is logged.

- **Auth:** Bearer token (any role)
- **Response:** `data.message: "Logged out"`

### `DELETE /auth/account`

Deletes the authenticated account. Cannot be undone.

- The Supabase login is deleted, and the account's details are removed: the email becomes `deleted-<id>@deleted.invalid` and the name "Deleted user". The row stays, so the records others rely on (results, marks, reviews, audit history) keep their links, now to an anonymous user. The email is freed, so the person can register again.
- An educator's school memberships end; a student's learner record (which belongs to the school) is kept but no longer linked to a login.
- **Auth:** Bearer token (any role)
- **Response:** `data.message: "Account deleted"`
- **Errors:** `409` an organiser whose olympiad still has a round without released results (nobody else could manage it); `502` Supabase couldn't delete the login, in which case nothing is changed

### `GET /auth/educator-olympiads`

Olympiads the educator's school is approved for.

- **Auth:** educator
- **Response:** `data.olympiads`

---

## Invitations

Invitations are delivered in the app, not by email, and are only ever sent to
people who already have an account. An invitation appears on the invitee's
dashboard, where they accept or reject it:

- an **organiser** invites an **educator**; accepting registers that educator's
  school for the olympiad, which is what makes it appear on their dashboard;
- an **educator** invites a **student of their own school**; accepting enters
  that student into every round of the olympiad that still takes registrations.

An invitation object is
`{ id, role, status, message, createdAt, respondedAt, olympiad, school, invitee, invitedBy }`,
where `status` is `pending`, `accepted` or `rejected`.

### `GET /invites/mine`

The invitations addressed to the signed-in user.

- **Auth:** Bearer token (any role)
- **Response:** `data.invites`

### `POST /invites/:inviteId/accept`

Accept an invitation addressed to you, performing the registration it stands for.

- **Auth:** Bearer token (any role); must be the invitee
- **Response:** `data.invite`
- **Errors:** `400` already answered; `403` not your invitation; `404` unknown invitation

### `POST /invites/:inviteId/reject`

Decline an invitation. Nothing is registered.

- **Auth:** Bearer token (any role); must be the invitee
- **Response:** `data.invite`

### `POST /invites`

Send an invitation.

- **Auth:** organiser or educator
- **Body:** `olympiad_id` (uuid, required), `invitee_id` (uuid, required), `message` (optional, <=500 chars)

An organiser may only invite educators, and only to their own olympiads. An
educator may only invite students of their own school, and only to an olympiad
their school is approved for.

- **Response `201`:** `data.invite`
- **Errors:** `400` wrong role for the inviter; `403` not yours / not your school; `409` already invited to this olympiad

### `DELETE /invites/:inviteId`

Withdraw an invitation you sent that has not been answered yet.

- **Auth:** organiser or educator; must be the sender
- **Response:** `data.id`
- **Errors:** `400` already answered; `403` not the sender

### `GET /invites/sent`

For an organiser, the invitations for one of their olympiads (requires
`olympiad_id`). For an educator, the student invitations for their school.

- **Auth:** organiser or educator
- **Query:** `olympiad_id` (organiser only)
- **Response:** `data.invites`

### `GET /invites/candidates`

The people the caller may still invite to an olympiad: every educator on the
platform for an organiser, and the school's own students for an educator.
Anyone already invited to that olympiad is left out.

- **Auth:** organiser or educator
- **Query:** `olympiad_id` (uuid, required)
- **Response:** `data.candidates` - `[{ id, name, email, school }]`

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

Schools taking part in the olympiad, plus the educators who have been invited and have not accepted yet. Each row carries a `status` of `accepted` (participating), `pending` (invited) or `declined`; a pending row is keyed by the invitation rather than the school.

### `GET /olympiads/archive`

Organiser-only. One archive of past papers shared by all of the organiser's olympiads: every round whose results have been released and whose paper has been archived, most recently closed first. The organiser's Archive page uses this.

- **Response:** `data.rounds` — each round with its `papers` (`file_url`, `memo_file_url`, `is_archived`, …) and `olympiads` (`{ id, name, timezone }`), so rounds from different olympiads can be told apart and their times shown in each olympiad's timezone.
- Download a file with `GET /papers/:id/download`.

### `GET /olympiads/:olympiadId/archive`

The same list, for a single olympiad. Closed rounds with downloadable paper/memo files.

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
| `qualifying_threshold` | number 0–100 | optional; a **percentage** of the paper's total marks (e.g. `60` = 60%) |

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

- **Response:** `data.questions`, in the order they were added.
- For organisers, each question also has `difficulty`: how hard it proved in this round (see below). Educators don't get it.

#### Question difficulty

`difficulty` is `{ value, band, answered }`, derived from how entrants actually answered:

- `value` = 1 − (average score ÷ max points), over the question's **marked** answers, kept between 0 and 1. Unfinished online exams and essays not yet marked don't count; a question left blank in a submitted exam counts as 0.
- `band` is `easy` (value below 0.3), `medium` (0.3–0.7) or `hard` (above 0.7).
- `answered` is how many marked answers it is based on. With fewer than 5, `value` and `band` are `null`.

It is worked out on each request, so re-marks, moderation and remarks show straight away.

### `GET /rounds/:roundId/question-bank`

Organiser-only. The organiser's questions from their other rounds, across all their olympiads, to reuse on this round's paper.

- A question and the copies imported from it are listed **once**, as the original.
- A question already on this round's paper (as the original or any copy) is left out.
- **Response:** `data.questions` — each question with:
  - `source_round` — `{ id, name }` of the round the original is on
  - `used_in` — `[{ id, name }]`, every round the question has been used in
  - `difficulty` — as above, over its answers in **all** those rounds

### `POST /rounds/:roundId/question-bank/import`

Organiser-only, while the exam is `draft`. Copies the chosen bank questions onto this round's paper; each copy records the original in `source_question_id`.

- **Body:** `question_ids` — array of question UUIDs (at least one)
- Choosing several versions of one question imports it once.
- **Response `201`:** `data.questions` — the new copies
- **Errors:** `400` exam not in draft · `404` a question isn't the organiser's or doesn't exist (nothing is imported) · `409` a question is already on this paper (nothing is imported)

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

- **Ranks:** highest total first; equal totals share a rank and the next rank skips ("1, 1, 3").
- **Qualification:** an entrant qualifies when their total is at least `qualifying_threshold` percent of the paper's total marks (the sum of its questions' `max_points`). Qualifiers are entered for the olympiad's next round. With no threshold, nobody qualifies.

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

- Once the round's deadline has passed → `400` "The round has closed", even in the moments before the lifecycle job marks the round closed.
- **Response `201`:** `data.submission` — `{ id, status, answers }`

### `PATCH /rounds/:roundId/exam/answers/:qid`

Auto-save a single answer as the student types.

- **Body:** `answer_value` (string, optional — omit to clear)
- An answer can change until the deadline (same rule as submitting). After it, or in a round the organiser closed early → `400` "The round has closed; answers can no longer be changed". If the attempt was marked while the save waited → `400` "This exam has already been submitted".

### `POST /rounds/:roundId/exam/submit`

Finalize the submission. Auto-marks MCQ/true-false (partial credit, negative marking) and short answers (case-insensitive match) inline; essays are left for the organiser's marking queue. Sets submission status to `automarked` or `queued_for_marking` and upserts the entrant's result row.

- **The deadline:** the request's arrival time is compared with the round's closing time as it stands (so an extension counts), and the closing instant is exclusive. A submission that arrived before the close still counts if the round closed while it was being handled. Every ruling, accepted or not, is recorded (see the round replay).
- **Once only:** the attempt is claimed before it is marked, so a double click, or the close-time marking reaching it at the same moment, marks it once; the other request gets `400` "This exam has already been submitted".
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
