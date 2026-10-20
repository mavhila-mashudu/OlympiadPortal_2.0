# Olympiad Portal — API Reference

The backend is a hand-written Express (Node.js) REST API backed by PostgreSQL (Prisma ORM) and Supabase Auth/Storage.

- **Base URL:** `https://olympiad-portal-api.azurewebsites.net` (local dev: `http://localhost:3000`)
- **Public developer API:** open to any website without an account; see [Public Developer API](#public-developer-api)
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

Every response carries `Cache-Control: no-store`, so browsers never keep personal data (names, answers, marks) on disk or show it again after logout. The exception is the [public developer API](#public-developer-api), which holds no personal data and may be cached for a minute.

### Roles

| Role        | Who            | Typical access                                                 |
| ----------- | -------------- | -------------------------------------------------------------- |
| `organiser` | Runs olympiads | Olympiad/round/paper/marking management                        |
| `educator`  | School staff   | Entrant registration, question management, offline submissions |
| `student`   | Entrants       | Sitting online exams, viewing own results                      |

---

## Health

### `GET /health`

Liveness probe. No auth.

```json
{
    "status": "ok",
    "timestamp": "2026-09-14T10:00:00.000Z",
    "environment": "development"
}
```

### `GET /`

API welcome message. No auth.

---

## Public Developer API

Read-only data about olympiads, rounds, schools, results and past papers,
for anyone to build on: school websites, widgets, dashboards and other apps.
No account or token is needed.

- **Base URL:** `https://olympiad-portal-api.azurewebsites.net/public/v1`
  (locally, `http://localhost:3000/public/v1`)
- **Versioning:** the path carries the version. This page documents `v1`;
  if a breaking change is ever needed, it will ship as `/public/v2` with
  `v1` left working, so call the full versioned path, never bare `/public`.
- **Methods:** `GET` only. Responses use the [usual envelope](#response-envelope).
- **From the browser:** any website may call it. Responses carry
  `Access-Control-Allow-Origin: *`, and no cookies or credentials are used.
  The rest of the API only accepts the portal's own site.
- **Caching:** responses carry `Cache-Control: public, max-age=60, stale-while-revalidate=300`,
  so a browser or CDN can reuse one for a minute and briefly serve it stale while
  it refreshes. There is no need to call more often than once a minute.
- **Rate limit:** 300 requests per 15 minutes per client IP. Every response
  says where you stand in the standard `RateLimit` and `RateLimit-Policy`
  headers, e.g. `RateLimit: "300-in-15min"; r=297; t=812` (297 requests
  left, window resets in 812 seconds). Over the limit you get `429`; wait
  `t` seconds.

### Privacy

The public API only returns aggregated data (totals, averages, medians,
score distributions and school rankings) and papers whose round's results
are released. It never returns a learner's name, email, id or own result,
an answer, or anyone's contact details. The one person named is an
olympiad's organiser (`organiserName`).

A school's figures for a round are an average over its learners. When a
school entered only one learner, that average is that learner's score.

### Example

```bash
curl https://olympiad-portal-api.azurewebsites.net/public/v1/olympiads?limit=5
```

```js
// From any web page
const res = await fetch(
    'https://olympiad-portal-api.azurewebsites.net/public/v1/schools/top?limit=10'
);
const { success, data, error } = await res.json();
if (!success) throw new Error(error);
data.forEach((school) =>
    console.log(school.rank, school.schoolName, school.averageScore)
);
```

### Endpoints

| Endpoint                                                                 | Returns                                                               |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `GET /public/v1/stats`                                                   | Platform totals                                                       |
| `GET /public/v1/stats/yearly`                                            | Totals for each year                                                  |
| `GET /public/v1/activity`                                                | Recently closed rounds, upcoming rounds and recently released results |
| `GET /public/v1/calendar`                                                | Rounds running within a date range                                    |
| `GET /public/v1/search`                                                  | Olympiads, schools and rounds matching a name                         |
| `GET /public/v1/olympiads`                                               | Olympiads, with search, year filter, sorting and pages                |
| `GET /public/v1/olympiads/:olympiadId`                                   | One olympiad and its rounds                                           |
| `GET /public/v1/olympiads/:olympiadId/rounds/:roundId/results`           | A released round's result statistics                                  |
| `GET /public/v1/olympiads/:olympiadId/rounds/:roundId/results/by-school` | The same, for each school                                             |
| `GET /public/v1/olympiads/:olympiadId/leaderboard`                       | Schools ranked by average score in an olympiad                        |
| `GET /public/v1/schools/top`                                             | Schools ranked by average score across every olympiad                 |
| `GET /public/v1/schools`                                                 | Schools, with search and pages                                        |
| `GET /public/v1/schools/:schoolId`                                       | One school's participation and averages                               |
| `GET /public/v1/papers`                                                  | Past papers of released rounds, with download links                   |
| `GET /public/v1/papers/:paperId/download`                                | Downloads a past paper or its memo                                    |

Lists that page take `page` (from 1) and `limit`, and return a `pagination`
object: `{ page, limit, total, totalPages }`. Ids are UUIDs; a malformed one
gets `422`. Dates are ISO 8601 in UTC.

> 📖 **Full Specification & Request/Response Payloads:** For complete JSON schemas, parameter tables, cURL/Python integration recipes, and schema documentation for all 15 public endpoints, please refer to the dedicated **[Public Developer API Reference](./public-developer-api.md)**.

### Errors

| Status | When |
| :--- | :--- |
| `400` | A round's results aren't released yet |
| `404` | No such olympiad, round, school or paper, or an unknown `/public/v1` path |
| `422` | A malformed id or query parameter; `error` says which |
| `429` | Over the rate limit; see the `RateLimit` header for when to retry |
| `502` | The paper store couldn't be reached |

---

## Testing & Performance Benchmarks

The API includes standardized Postman collections, automated CLI test suites, and high-concurrency performance benchmark tools.

### 1. Postman Test Suite

A standardized Postman Collection (v2.1 format) is available in the [`postman/`](../postman) directory:

* **Collection File:** [`postman/OlympiadPortal.postman_collection.json`](../postman/OlympiadPortal.postman_collection.json)
* **Environment File:** [`postman/OlympiadPortal.postman_environment.json`](../postman/OlympiadPortal.postman_environment.json)
* **Usage Guide:** [`docs/postman-testing.md`](./postman-testing.md)

#### Running via Postman Desktop App (GUI)
1. Open the Postman Desktop App and click **Import** (top left).
2. Select `postman/OlympiadPortal.postman_collection.json` and `postman/OlympiadPortal.postman_environment.json`.
3. In the environment selector, choose **Olympiad Portal — Production (Azure)**.
4. Click **Run** to execute the functional requests and automated assertions, or switch to the **Performance** tab to plot real-time latency and throughput curves under virtual user load.

#### Running via Postman CLI (Headless)
```bash
# Run against deployed Azure API
postman collection run postman/OlympiadPortal.postman_collection.json

# Run against local development API
postman collection run postman/OlympiadPortal.postman_collection.json --env-var "baseUrl=http://localhost:3000"
```

### 2. High-Concurrency Performance Benchmark (`npm run test:perf`)

To satisfy performance and load criteria without external dependencies, a native Node.js benchmark suite is provided in [`backend/scripts/benchmark.js`](../backend/scripts/benchmark.js):

```bash
cd backend
npm run test:perf
```

This tests cold-start latency, warm latency, and executes 250 requests under concurrent load across all core API archetypes.

#### Deployed Azure Benchmark Results (Live Evidence)

* **Host:** `https://olympiad-portal-api.azurewebsites.net`
* **First Request Cold Start:** `439.4 ms` (`GET /health`)
* **Warm Request Latency:** `97.3 ms` (Cold start overhead: ~342 ms)
* **Crash Rate under Load:** **0% (0 server crashes / 0 5xx errors across 250 concurrent requests)**

| Endpoint Archetype | Reqs | Concurrency | Throughput (RPS) | 200 OK | 5xx (Crashes) | Avg Latency | p50 (Median) | p95 Latency | p99 Latency |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Health Probe (`/health`)** | 50 | 10 | **100.0 req/s** | 50 | 0 | 87.6 ms | 68.4 ms | 189.0 ms | 196.3 ms |
| **Top Schools (`/schools/top`)** | 50 | 10 | **28.6 req/s** | 50 | 0 | 323.9 ms | 327.8 ms | 435.5 ms | 436.3 ms |
| **Schools Directory (`/schools`)** | 50 | 10 | **24.1 req/s** | 50 | 0 | 397.0 ms | 367.8 ms | 677.4 ms | 804.1 ms |
| **Olympiads Query (`/olympiads`)** | 50 | 10 | **9.7 req/s** | 50 | 0 | 930.8 ms | 880.3 ms | 1,077.4 ms | 1,789.2 ms |
| **Public Stats (`/stats`)** | 50 | 10 | **9.4 req/s** | 50 | 0 | 984.0 ms | 913.7 ms | 1,851.2 ms | 2,032.5 ms |

---

## Authentication & Registration

Registration is open to educators and students: no invitation code is involved.
They say which school they belong to when they sign up; taking part in a
particular olympiad is then arranged through the in-app invitations below.

Organisers cannot register themselves. The role carries authority over every
olympiad the account owns, so the portal administrator creates organiser
accounts with `npm run create-organiser` (see the backend README).

### `POST /auth/register`

Create an educator or student account. Asking for the `organiser` role is refused with `422`.

- **Auth:** none
- **Body:**

| Field         | Type   | Rules                                              |
| ------------- | ------ | -------------------------------------------------- |
| `full_name`   | string | required                                           |
| `email`       | string | required, valid email                              |
| `password`    | string | required, >=8 chars, >=1 uppercase, >=1 number     |
| `role`        | string | required, one of `educator`, `student`             |
| `school_id`   | uuid   | required for a student; optional for an educator   |
| `school_name` | string | educator only, when their school is not listed yet |
| `invitation_code` | string | educator only, optional: the code from an invitation email |

An educator supplies either `school_id` (a school already on the platform) or
`school_name` (a new one, matched case-insensitively against existing schools
before being created). The first educator at a school proposes becoming its
`coordinator`; later ones join as `educator`. Either way the membership is
`pending` until an organiser (for a school's first coordinator) or the school's
coordinator approves it (see `/membership-requests`).

An educator who has an **invitation code** (see `/school-invitations`) sends it
as `invitation_code` and skips that wait: the membership is created `active`
straight away. The code decides the school, so `school_id` and `school_name` are
ignored, and the email must be the address the invitation was sent to. A code
that is unknown, expired, used, cancelled, or meant for another address is
refused with `400`; it never falls back to a pending signup. Without a code,
signup works as described above.

A student must supply `school_id`. The student gets a `pending` entrant record
and no access until the school's coordinator approves them. The student is
**not** matched to an entrant an educator listed under the same name; the
coordinator chooses whether to link them to one when approving
(`PATCH /membership-requests/:requestId`).

- **Response `201`:** `data.user` - `{ id, full_name, email, role, created_at }`
- **Errors:** `400` missing/invalid school, or an invalid invitation code; `404` school not found; `409` email already registered

### School signup invitations (educators and students)

An organiser may email an educator a signup code for a selected school. Any
**active** school educator (coordinator or ordinary educator) may invite other
educators and students **only to their own school**. The email includes the
code and a link to `/signup?code=…`. An email-, school-, and account-type-bound
code grants immediate access; signup without one still awaits the normal
coordinator/organiser approval. Codes are one-use, expire after 7 days, and
only their hashes are stored. Student codes create a *new* active entrant;
existing records/results are never claimed by name. These school signup codes
are separate from the existing in-app Olympiad participation invitations.

#### `POST /school-invitations/check`

What an invitation code leads to, so the signup form can show the school and
the invited address before the account is created. No auth, so it answers
before the guard the routes below require; rate limited per client IP like
signup, because a code is secret.

- **Body:** `code` (string; case, spaces and dashes don't matter)
- **Response:** `data.invitation` - `{ school: { id, name }, email, role, accountType }`, where `accountType` is `student` or `educator`; educator invitations have school `role` of `educator` or `coordinator`
- **Errors:** `400` the code isn't valid. The message is the same whether the code is unknown, used, cancelled or expired.

#### `POST /school-invitations`

- **Body:** `email` (required); `account_type` (`educator` or `student`, default `educator`); `school_id` (required for an organiser, ignored for an educator who is restricted to their own school)
- Organisers can invite **educators only**, including a first coordinator. Approved school educators can invite **students or educators**, but never create coordinator authority.
- **Response `201`:** `data.invitation` - `{ id, email, accountType, role, status, createdAt, expiresAt, school, invitedBy }`, and `data.emailSent`. If the email could not be delivered, `data.code` and `data.signupUrl` are returned as well, so the inviter can pass them on.
- The invited `role` is `coordinator` when an organiser invites someone to a school with no active coordinator, and `educator` otherwise. A newer invitation to the same address replaces an earlier open one.
- **Errors:** `400` no school or invalid account type; `403` not permitted for that school; `404` school not found; `409` that address already has an account; `429` more than 30 invitations in an hour

#### `GET /school-invitations`

- **Query:** `school_id` (organisers only; optional filter)
- **Response:** `data.invitations`, newest first. `status` is `pending`, `used`, `revoked` or `expired`.

#### `DELETE /school-invitations/:invitationId`

Cancels an invitation that hasn't been used. Repeating it is harmless.

- **Errors:** `403` not allowed for that school; `404` not found; `409` already used

### `GET /schools`

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

### `POST /auth/logout`

Ends the session the request's token belongs to. Supabase revokes it, so it can't be refreshed or used again, and the server stops accepting the token at once. The frontend calls this before forgetting the token; if Supabase can't be reached the logout still succeeds, and the failure is logged.

- **Auth:** Bearer token (any role)
- **Response:** `data.message: "Logged out"`

---

## The Signed-in User

Everything under `/me` is the signed-in user's own view of their data. All
routes require a Bearer token (any role); where a URL is shared by two roles,
the response follows the caller's role.

### `GET /me`

Current user profile.

- **Auth:** Bearer token (any role)
- **Response:** `data.user` with `school_memberships`, `educators`, and `entrants` relations for school context

### `DELETE /me`

Deletes the authenticated account. Cannot be undone.

- The Supabase login is deleted, and the account's details are removed: the email becomes `deleted-<id>@deleted.invalid` and the name "Deleted user". The row stays, so the records others rely on (results, marks, reviews, audit history) keep their links, now to an anonymous user. The email is freed, so the person can register again.
- An educator's school memberships end; a student's learner record (which belongs to the school) is kept but no longer linked to a login.
- **Auth:** Bearer token (any role)
- **Response:** `data.message: "Account deleted"`
- **Errors:** `409` an organiser whose olympiad still has a round without released results (nobody else could manage it); `502` Supabase couldn't delete the login, in which case nothing is changed

### `GET /me/rounds`

One URL for both roles, dispatched by the caller's role. A student gets the
rounds they are registered for, plus dashboard stats (entered count, results
available, certificates); an educator gets their school's rounds across the
olympiads the school is registered for.

### `GET /me/rounds/:roundId`

One URL for both roles, dispatched by the caller's role. A student gets the
round page they see from the dashboard (timing, paper availability, their own
submission, and own result when released); an educator gets their school's view
of the round (paper, the school's submissions, results availability). Replaces
the former student route `GET /rounds/:roundId/details`.

- **Param:** `roundId` must be a valid UUID

### `GET /me/rounds/:roundId/results`

The educator's view of one round's released results, scoped to the educator's
own school. Generating results stays the organiser's
`POST /rounds/:roundId/results`.

- **Auth:** educator

### `GET /me/results`

One URL for both roles, dispatched by the caller's role. A student gets
released results for completed rounds, incl. score, percentage, and certificate
availability; an educator gets every entrant's results for rounds of their
school with released results.

### `GET /me/olympiads`

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

The caller's own lists live under `/me`, and actions on a single invitation
under `/olympiad-invitations`. These are not the school signup codes: those
create accounts and are documented under
[School signup invitations](#school-signup-invitations-educators-and-students).

### `GET /me/olympiad-invitations`

The invitations addressed to the signed-in user.

- **Auth:** Bearer token (any role)
- **Response:** `data.invites`

### `GET /me/sent-olympiad-invitations`

For an organiser, the invitations for one of their olympiads (requires
`olympiad_id`). For an educator, the student invitations for their school.

- **Auth:** organiser or educator
- **Query:** `olympiad_id` (organiser only)
- **Response:** `data.invites`

### `GET /me/olympiad-invitation-candidates`

The people the caller may still invite to an olympiad: every educator on the
platform for an organiser, and the school's own students for an educator.
Anyone already invited to that olympiad is left out.

- **Auth:** organiser or educator
- **Query:** `olympiad_id` (uuid, required)
- **Response:** `data.candidates` - `[{ id, name, email, school }]`

### `POST /olympiad-invitations`

Send an invitation.

- **Auth:** organiser or educator
- **Body:** `olympiad_id` (uuid, required), `invitee_id` (uuid, required), `message` (optional, <=500 chars)

An organiser may only invite educators, and only to their own olympiads. An
educator may only invite students of their own school, and only to an olympiad
their school is approved for.

- **Response `201`:** `data.invite`
- **Errors:** `400` wrong role for the inviter; `403` not yours / not your school; `409` already invited to this olympiad

### `POST /olympiad-invitations/:invitationId/accept`

Accept an invitation addressed to you, performing the registration it stands for.

- **Auth:** Bearer token (any role); must be the invitee
- **Response:** `data.invite`
- **Errors:** `400` already answered; `403` not your invitation; `404` unknown invitation

### `POST /olympiad-invitations/:invitationId/reject`

Decline an invitation. Nothing is registered.

- **Auth:** Bearer token (any role); must be the invitee
- **Response:** `data.invite`

### `DELETE /olympiad-invitations/:invitationId`

Withdraw an invitation you sent that has not been answered yet.

- **Auth:** organiser or educator; must be the sender
- **Response:** `data.id`
- **Errors:** `400` already answered; `403` not the sender

---

## Olympiads

Most olympiad endpoints are organiser-only and scoped to the organiser's own
olympiads; the entrants and progression endpoints serve educators and are
scoped to their school in the service.

### `POST /olympiads`

- **Auth:** organiser
- **Body:** `name` (required), `timezone` (optional)
- **Response `201`:** `data.olympiad`

### `GET /olympiads`

List the organiser's olympiads.

### `GET /olympiads/:olympiadId`

Single olympiad. `404` if not found or not owned by caller.

### `PATCH /olympiads/:olympiadId`

Rename an olympiad.

- **Auth:** organiser (must own the olympiad)
- **Body:** `{ "name": "New Name" }` (required)
- **Response:** `data.olympiad`

### `DELETE /olympiads/:olympiadId`

Delete an olympiad. Fails with `400` if the olympiad has any rounds — delete the rounds first.

- **Auth:** organiser (must own the olympiad)
- **Response:** `data.message`

### `GET /olympiads/:olympiadId/schools`

Schools taking part in the olympiad, plus the educators who have been invited and have not accepted yet. Each row carries a `status` of `accepted` (participating), `pending` (invited) or `declined`; a pending row is keyed by the invitation rather than the school.

### `GET /olympiads/:olympiadId/papers/archive`

One olympiad's archive: every round whose results have been released and whose paper has been archived, most recently closed first. Closed rounds with downloadable paper/memo files. The shared archive across all of the organiser's olympiads is `GET /papers/archive`.

### `POST /olympiads/:olympiadId/entrants`

Register learners of the educator's school for the olympiad. They are saved to
the school and registered for every round that still takes registrations.

- **Auth:** educator; the school must be registered for the olympiad
- **Body:** `entrants` — array of `{ full_name (required), grade, external_ref }`
- **Response `201`:** `data.entrants` — each with the rounds it was entered for

### `GET /olympiads/:olympiadId/entrants`

The school's entrants in the olympiad, each with the rounds it is registered
for.

- **Auth:** educator; the school must be registered for the olympiad
- **Response:** `data.entrants`

### `GET /olympiads/:olympiadId/progression`

For every round of the olympiad: whether it requires qualification, which round
is the previous one, which entrants qualified, and the round's state.

- **Auth:** educator; the school must be registered for the olympiad
- **Response:** `data.rounds`

---

## Rounds

### Create / list (nested under olympiad)

#### `POST /olympiads/:olympiadId/rounds`

- **Auth:** organiser (must own the olympiad)
- **Body:**

| Field                  | Type          | Rules                                                                   |
| ---------------------- | ------------- | ----------------------------------------------------------------------- |
| `name`                 | string        | required                                                                |
| `notes`                | string        | optional                                                                |
| `opens_at`             | ISO 8601 date | required                                                                |
| `closes_at`            | ISO 8601 date | required                                                                |
| `qualifying_threshold` | number 0–100  | optional; a **percentage** of the paper's total marks (e.g. `60` = 60%) |

- **Response `201`:** `data.round`; optional `data.warnings` (array of strings) when `opens_at` or `closes_at` falls on a SA public holiday — e.g. `"2026-12-16 falls on a public holiday: Day of Reconciliation"`. The round is still created; warnings are advisory only.

#### `GET /olympiads/:olympiadId/rounds`

List rounds for the olympiad.

#### `POST /olympiads/:olympiadId/rounds/date-check`

Pre-flight holiday check. Call before creating or updating a round to surface public holiday clashes without persisting anything. The olympiad in the path decides which calendar the dates are read in, so the organiser must own it.

- **Auth:** organiser
- **Body:**

| Field       | Type          | Rules    |
| ----------- | ------------- | -------- |
| `opens_at`  | ISO 8601 date | required |
| `closes_at` | ISO 8601 date | required |

- **Response:** `data.warnings` — array of strings, e.g. `["2026-12-16 falls on a public holiday: Day of Reconciliation"]`. Empty array when no clashes.

> **External dependency:** Holiday data is fetched from [date.nager.at](https://date.nager.at) (free, no API key, `ZA` country code). If the external service is unreachable, warnings are silently skipped — the check never blocks round creation.

### Read / update / delete (standalone)

#### `GET /rounds/:roundId`

Round detail incl. state, timing, and paper info. Organiser must own the round.

#### `PATCH /rounds/:roundId`

Update round metadata. Same body fields as create, all optional. Response includes `data.warnings` (same shape as create) when dates fall on public holidays.

#### `PATCH /rounds/:roundId/state`

Transition the round lifecycle.

- **Auth:** organiser
- **Body:** `state` — one of `scheduled`, `open`, `closed`, `marking`, `results_released`
- **Response:** `data.round`

#### `DELETE /rounds/:roundId`

Delete the round and its dependent records.

#### `POST /rounds/:roundId/papers`

Upload the question paper and/or memo PDF for a round.

- **Auth:** organiser
- **Content type:** `multipart/form-data`
- **Fields:** `paper` (file, ≤20 MB), `memo` (file, ≤20 MB) — either or both
- **Storage:** files go to Supabase Storage (`papers` bucket); the DB stores the object paths
- **Response `201`:** `data.paper` — `{ id, round_id, title, file_url, memo_file_url, ... }`
- Re-uploading replaces the previous files (upsert).

### Entrants and progression (educator)

#### `POST /rounds/:roundId/entrants`

Register learners of the educator's school for the round. A learner who already
has an `external_ref` in the school is updated rather than duplicated. When the
round requires qualification (a previous round has released results), only
learners who qualified are accepted; **nobody in the batch is registered if one
learner is refused.**

- **Auth:** educator; the school must be registered for the olympiad
- **Body:** `entrants` — array of `{ full_name (required), grade, external_ref }`
- **Response `201`:** `data.entrants`
- **Errors:** `400` once the round has closed, or when a learner did not qualify in the previous round

#### `GET /rounds/:roundId/entrants`

The school's entrants in the round.

#### `GET /rounds/:roundId/progression`

Whether the round requires qualification, which round decides it, and which
entrants qualified.

---

## Notification Rules

Scheduled email rules for an olympiad (e.g. "notify all registered educators 60 minutes before a round closes"). Organiser-only, nested under olympiads.

### `GET /olympiads/:olympiadId/notification-rules`

### `POST /olympiads/:olympiadId/notification-rules`

- **Body:**

| Field            | Type        | Values                                                              |
| ---------------- | ----------- | ------------------------------------------------------------------- |
| `name`           | string      | optional label                                                      |
| `trigger`        | string      | `round_opens`, `round_closes`, `results_released`                   |
| `offset_minutes` | integer ≥ 0 | minutes before/after trigger                                        |
| `recipient`      | string      | `registered_educators`, `registered_schools`, `qualifying_entrants` |
| `condition`      | string      | optional filter expression                                          |
| `enabled`        | boolean     | optional                                                            |

- **Response `201`:** `data.rule`

### `PATCH /olympiads/:olympiadId/notification-rules/:ruleId`

Update any subset of the fields above.

### `DELETE /olympiads/:olympiadId/notification-rules/:ruleId`

---

## Questions

Manage the question paper for a round. Both organisers and educators can manage questions (organiser ownership and educator school access are checked in the service layer).

### `POST /rounds/:roundId/questions`

- **Body:**

| Field            | Type          | Rules                                                                                         |
| ---------------- | ------------- | --------------------------------------------------------------------------------------------- |
| `type`           | string        | `mcq`, `true_false`, `short_answer`, `essay`                                                  |
| `prompt`         | string        | required                                                                                      |
| `options`        | string[]      | for `mcq` / `true_false`                                                                      |
| `correct_option` | string        | comma-separated option indexes, e.g. `"0,2"`; no repeats. Multiple indexes → multi-select MCQ |
| `correct_answer` | string        | expected answer for `short_answer`                                                            |
| `negative_pct`   | number 0–100  | % of max points deducted per wrong MCQ selection (0 = off)                                    |
| `max_points`     | number ≥ 0.01 | points for a correct answer                                                                   |

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

### `PATCH /rounds/:roundId/questions/:questionId`

Same fields as create, all optional.

### `DELETE /rounds/:roundId/questions/:questionId`

---

## Exam Approval (Exam Status)

Two-stage verification before students can sit an online exam. Educators submit the finished exam for review; approving it or sending it back is organiser-only.

### `GET /rounds/:roundId/exam/status`

- **Response:** `data` — `{ exam_status, state, question_count, questions_by_type, paper_id, approved_by, approved_at, approved_by_name }`

### `PATCH /rounds/:roundId/exam/status`

- **Body:** `status` — `draft`, `ready`, or `live`
- **Allowed transitions:**
    - `draft` → `ready` (requires ≥1 question on the paper)
    - `ready` → `draft` (un-approve)
    - `ready` → `live` (records approver + timestamp for the audit trail)
    - `live` → (terminal; no transitions out)

---

## Papers & Downloads

### `GET /papers/archive`

Organiser-only. One archive of past papers shared by all of the organiser's olympiads: every round whose results have been released and whose paper has been archived, most recently closed first. The organiser's Archive page uses this.

- **Response:** `data.rounds` — each round with its `papers` (`file_url`, `memo_file_url`, `is_archived`, …) and `olympiads` (`{ id, name, timezone }`), so rounds from different olympiads can be told apart and their times shown in each olympiad's timezone.
- Download a file with `GET /papers/:paperId/download`.

### `GET /rounds/:roundId/papers/preview`

Signed, time-limited viewing URL (1 hour) for a round's paper or memo.

- **Auth:** organiser or educator
- **Query:** `type=paper` (default) or `type=memo`
- Organisers get both; educators get the paper only (a memo request gives `403`; the memo backs organiser verification).

### `GET /rounds/:roundId/papers/download`

Signed direct download URL (60 seconds). One URL for both roles; the response follows the caller's role. An educator gets their school's paper for the round (the memo gives `403`); a student gets the question paper of a round they are registered for. `400` before the round opens; `404` without an uploaded paper.

- **Auth:** educator or student
- **Query:** `type=paper` (default) or `type=memo` (educator only)

### `GET /rounds/:roundId/papers/archive`

An educator's past papers for the round: earlier closed rounds of the olympiad, with their downloadable paper/memo files.

- **Auth:** educator

### `GET /papers/:paperId/download`

Signed direct download URL (60 seconds). Organiser-only.

- **Query:** `type=paper` (default) or `type=memo`

---

## Submissions

### `POST /rounds/:roundId/submissions`

Create a submission on behalf of an entrant (offline/paper route).

- **Auth:** educator
- **Body:**

| Field        | Type   | Rules                                                                   |
| ------------ | ------ | ----------------------------------------------------------------------- |
| `entrant_id` | UUID   | required                                                                |
| `route`      | string | `online` or `offline` (optional)                                        |
| `answers`    | array  | required, ≥1 item — each `{ question_id: UUID, answer_value?: string }` |

- **Response `201`:** `data` — `{ submission, answers, totalPoints, autoMarked }`

### `GET /rounds/:roundId/submissions`

List submissions for a round.

- **Auth:** educator or organiser

### `GET /rounds/:roundId/submissions/:submissionId`

Single submission with answers.

- **Auth:** educator or organiser

---

## Marking

The organiser and the round's educators may mark; generating results is organiser-only.

### `POST /rounds/:roundId/auto-mark`

Bulk auto-mark all received submissions in the round (MCQ, true/false, short answer).

### `GET /rounds/:roundId/marking-queue`

Answers still awaiting manual marking (essays), grouped by submission, with the memo answer shown for comparison.

- **Response:** `data.submissions` — each `{ id, received_at, is_late, entrants: { full_name, grade }, answers: [...] }`

### `POST /rounds/:roundId/results`

Generate final results with ranks and qualification status. Requires all answers to be marked first.

- **Ranks:** highest total first; equal totals share a rank and the next rank skips ("1, 1, 3").
- **Qualification:** an entrant qualifies when their total is at least `qualifying_threshold` percent of the paper's total marks (the sum of its questions' `max_points`). Qualifiers are entered for the olympiad's next round. With no threshold, nobody qualifies.

### `PATCH /rounds/:roundId/answers/:answerId`

Manually mark a single answer.

- **Body:** `is_correct` (boolean, required), `points_awarded` (number ≥ 0, required)

---

## Student Portal

All student endpoints require the `student` role and an entrant profile linked to the account.

### `GET /me/rounds/:roundId`

Detailed round info for the student (timing, paper availability, own result
when released). Shared with educators, who get their school's view — see
[The Signed-in User](#the-signed-in-user). Replaces the former
`GET /rounds/:roundId/details`.

- **Param:** `roundId` must be a valid UUID

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

### `PATCH /rounds/:roundId/exam/answers/:questionId`

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

| Status | Meaning                                                                 |
| ------ | ----------------------------------------------------------------------- |
| `400`  | Validation failure or invalid state transition (message explains which) |
| `401`  | No/invalid/expired token, or account deleted                            |
| `403`  | Authenticated but wrong role, or not the owner of the resource          |
| `404`  | Resource not found (or not owned by caller)                             |
| `409`  | Conflict — e.g. email already registered, duplicate record              |
| `422`  | A field or query parameter failed validation (message explains which)   |
| `429`  | Too many requests from this client; see the `RateLimit` header          |
| `500`  | Unexpected server error                                                 |
