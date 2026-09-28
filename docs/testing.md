# Olympiad Portal — Testing Documentation

This document covers how the Olympiad Portal is tested:

1. [Testing approach](#1-testing-approach)
2. [Automated testing procedure](#2-automated-testing-procedure) — every type of test, why it is used, what it covers
3. [Running the tests](#3-running-the-tests)
4. [How CI enforces the tests](#4-how-ci-enforces-the-tests)
5. [Test policy](#5-test-policy)
6. [User feedback process](#6-user-feedback-process)

Bugs found by testing and by users are recorded in [bug-tracking.md](bug-tracking.md).

---

## 1. Testing approach

The portal has a React frontend and an Express + PostgreSQL backend, used by three roles: organisers, educators and students. Tests are written at four levels, each answering a different question.

| Level | Question it answers | Tests | Speed |
|---|---|---|---|
| Unit | Does each function, component and hook work on its own? | 923 | Seconds |
| Integration | Do the parts work together — services with a real database, whole pages with the app's real logic? | 234 | Seconds |
| API | Does every endpoint return the right response, and let in only the right people? | 482 | ~45s |
| End-to-end | Can each role finish their real tasks in a real browser? | 15 | ~40s |
| **Total** | | **1,654** | |

Most tests sit at the lower levels, because they are fast and point straight at the cause of a failure. A small number of end-to-end tests cover the critical journeys from start to finish.

| Suite | Location | Tools |
|---|---|---|
| Backend unit | `backend/tests/unit` | Jest |
| Backend integration | `backend/tests/integration` | Jest + PGlite |
| Backend API | `backend/tests/api` | Jest + Supertest + PGlite |
| Frontend unit | `frontend/tests/unit` | Vitest + React Testing Library |
| Frontend integration | `frontend/tests/integration` | Vitest + React Testing Library + MSW |
| End-to-end | `frontend/e2e` | Playwright |

Coverage of the backend and frontend source:

| Suite | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Backend unit | 99.4% | 97.5% | 99.6% | 99.5% |
| Backend API | 94.6% | 82.5% | 97.4% | 95.5% |
| Frontend unit | 99.2% | 98.6% | 99.3% | 99.1% |

No suite needs a database, a `.env` file or an internet connection. Everything runs after `npm install` (plus one browser download for the end-to-end tests).

---

## 2. Automated testing procedure

### 2.1 Tools, and why they were chosen

| Tool | Used for | Why |
|---|---|---|
| **Jest** | Backend tests | The standard Node.js test runner: mocking, coverage and parallel runs built in. |
| **Vitest** | Frontend tests | Built for Vite, which the frontend already uses, so tests share the app's build setup. Its API matches Jest's, so one style covers the project. |
| **React Testing Library** | Frontend tests | Tests use a page the way a person does — finding buttons by their label, typing, clicking — so they keep working when the code behind them is reorganised. |
| **MSW** | Frontend integration tests | Intercepts network calls and answers with realistic backend responses, so pages run their real logic without a server. |
| **PGlite** | Backend integration, API and E2E tests | Real PostgreSQL running inside the test process: genuine constraints and data types, with nothing to install. |
| **Supertest** | Backend API tests | Sends real HTTP requests to the Express app and checks status codes, headers and bodies. |
| **Playwright** | End-to-end tests | Drives real browsers from one install, runs headless in CI without a separate GUI runner, and saves screenshots and traces when something fails. |

### 2.2 Unit tests

**What:** one function, component or hook at a time, with everything around it replaced by a mock.

**Why:** they run in seconds, so they can be run on every change, and a failure points at one exact place. They also make it practical to cover every branch — each validation rule, each error path.

**Backend** — services (auth and invitations, olympiads, rounds, questions, papers, submissions, marking, results, lifecycle, schools, notification rules, educator and student views), controllers, middleware (authentication, roles, validation, error handling, rate limiting), the scheduled round-lifecycle job and helpers. The database client is replaced by a mock, so each test decides what the database returns and checks what the code asked for.

**Frontend** — UI components, the API client, the Supabase client, login/logout helpers, data-fetching hooks, and the building blocks of each page (question form and cards, marking card, answer-key editor, invitation inbox and invite form, round status labels, dashboard helpers, exam timer, exam storage).

### 2.3 Integration tests

**What:** several real parts working together.

**Why:** unit tests mock everything around the code, so they can't catch problems in the joins — a database constraint, a transaction, a page reading a field the API doesn't send, a number arriving as text.

**Backend** — real services and Prisma against a real PostgreSQL database:

1. At the start of a run, an in-memory PostgreSQL database is created and every migration in `prisma/migrations` is applied in order. This also proves the migrations build a working database from scratch.
2. The app connects through its normal database code; only the connection address changes.
3. Every setting is given a safe test value before the app loads, so a developer's real `.env` can never be used.
4. Every table is emptied before each test, and the reset refuses to run against anything but the local test database.
5. Test data is built with shared factories (organisers, schools, educators, rounds, papers, learners, olympiad invitations).
6. Supabase and email are replaced by fakes.

Covered: the database schema itself, open sign-up in all three roles and the invitation chain (organiser → educator → student), olympiads and rounds, exam building and approval, the online exam, offline submissions and marking, results, educator and student views, schools, notification rules and papers.

**Frontend** — whole pages inside the real app, with its real routes, API client and data fetching; only the network is faked. MSW answers with the backend's exact response format and records every request, so tests can check what was sent. Any request without a prepared answer fails the test.

Covered: login and sign-up, password reset, account deletion, organiser dashboard and management pages, announcements and archive, exam review and marking, the exam builder, educator pages, student pages, and the full exam-sitting page (timer, autosave, offline saving, submission).

### 2.4 API tests

**What:** real HTTP requests through the whole backend — routing, security middleware, validation, business logic, database — checking the real response.

**Why:** the frontend depends on the API behaving exactly as documented, and these rules protect exam papers, answer keys, marks and learner data.

**Complete coverage is enforced.** All 66 endpoints are listed in `backend/tests/api/helpers/endpoints.js` with the roles allowed to call each. From that list the tests automatically check:

1. the list matches the route files — a new endpoint that isn't listed fails the run;
2. every protected endpoint returns **401** without a token;
3. every protected endpoint returns **403** for each role not allowed;
4. public endpoints work without a token.

Each area then covers the normal case, ownership (users from another olympiad or school are refused), validation (**422** with a clear message) and edge cases (a round that isn't open, a duplicate submission, a file over the size limit).

### 2.5 End-to-end tests

**What:** a real browser completing real tasks against the real frontend, the real backend and a real database.

**Why:** the final check that the whole system works for its users — real login, uploads, navigation and browser behaviour. Kept small, because these are the slowest tests.

**How it runs:** `frontend/e2e/servers.ts` starts everything for a run: a PostgreSQL database built from the migrations and seeded with known data, a local stand-in for Supabase (sign-in, password reset, file storage), the real backend, and the frontend built the way it is deployed. Tests then click through the UI — they even sign in by typing into the login form.

**Journeys covered (15 tests):**

| Area | Journey |
|---|---|
| Accounts | Sign in as each role · wrong password refused · log out · organiser sign-up · student sign-up by picking a school · educator sign-up with a new school · **password reset from end to end** · **account deletion** |
| Organiser | Create a round and upload its question paper, then open it · invite an educator, whose school then shows as invited |
| Exam workflow | The educator builds the exam and submits it for review → the organiser checks it and puts it live |
| Competition | A student sits the exam online and submits → the organiser closes the round and releases results → the student sees their score |
| Educator | Register a learner and invite a student · a student accepts and gets the olympiad |

**Deliberately left to the faster suites:** every validation message, permission checks for all 66 endpoints, offline exam behaviour, and page-by-page detail.

---

## 3. Running the tests

### Backend
```bash
cd backend
npm install
npm run test:unit                   # unit tests
npm run test:integration            # integration tests
npm run test:api                    # API tests
npm test                            # all three in order
npm run test:coverage               # unit coverage report
npm run test:integration:coverage   # integration coverage report
npm run test:api:coverage           # API coverage report
```

### Frontend
```bash
cd frontend
npm install
npm run test:unit          # unit tests
npm run test:integration   # integration tests
npm test                   # both
npm run test:watch         # unit tests, re-running on save
npm run test:coverage      # unit coverage report
npm run typecheck:tests    # type-check the test code
npm run lint               # lint
```

### End-to-end
```bash
cd frontend
npx playwright install chromium   # one-off browser download
npm run test:e2e                  # headless; starts its own database, backend and frontend
npm run test:e2e:report           # open the report after a failure
```

---

## 4. How CI enforces the tests

Everything runs through one Gitea Actions pipeline: [`.gitea/workflows/ci.yml`](../.gitea/workflows/ci.yml). Deployment sits in the same file as the tests, because a job can only wait for jobs in the same workflow — that is what stops failing code reaching Azure.

| Job | Runner | Pull request | Push to `main` | What it does |
|---|---|---|---|---|
| Backend checks & tests | ours | Yes | Yes | Prisma schema check, unit, integration and API tests |
| Frontend checks & tests | ours | Yes | Yes | Lint, test type-check, unit and integration tests, production build |
| End-to-end tests | shared | No | Yes | The Playwright journeys in Chromium |
| Work out what changed | ours | No | Yes | Decides whether the backend, the frontend or both need deploying |
| Deploy backend | ours | No | Yes, if `backend/` changed | Builds, migrates the database, then zip-deploys to Azure App Service |
| Deploy frontend | ours | No | Yes, if `frontend/` changed | Builds the site and uploads it to the Azure Storage `$web` container |

### Where the jobs run

Most jobs run on our own runner, `prompt-engineers-runner-1`, an Ubuntu VM in
Azure registered against this repository. It advertises a single label,
`prompt-engineers-azure`, which the shared runners do not, so a job asking for
that label can only land on ours — and, because it advertises nothing else, it
is never pulled into another team's `ubuntu-latest` queue.

The end-to-end job is the deliberate exception. Playwright, Chromium, a real
backend and a PGlite database together need more memory than the VM has, so it
keeps `runs-on: ubuntu-latest` and goes to the shared runners. On the 1 GiB VM
the suite took 12–18 minutes and still failed tests on timeouts, while swapping
heavily. Bigger machines were considered and set aside: a 4 GB Azure VM costs
about four times the current one, and Oracle's free Arm machines had no
capacity in our region.

Our runner takes one job at a time (`capacity: 1`), so jobs that once ran
side by side now queue. That is the cost of guaranteeing where they run.

**Node 22 is required, not merely recommended.** On Node 24 the frontend
integration suite fails: Mock Service Worker throws during handler lookup for
the multipart upload in `POST /rounds/:id/papers`, so the create-round journey
never reaches its redirect. The pipeline pins Node 22 through
`actions/setup-node`, and `package.json` declares `"node": ">=22"` — but that
range admits 24, so a developer running a newer Node locally will see this one
test fail for reasons that have nothing to do with their change.

Rules the pipeline applies:

- **Nothing deploys unless the backend and frontend checks passed.** Both deploy jobs wait for those two jobs.
- **The end-to-end suite runs alongside the deploys, not before them.** It depends on the shared runners, which can queue behind other teams for a long time, so it reports on the run without holding a deploy back. A red end-to-end result on `main` means something needs fixing promptly, even though the deploy has already gone out.
- **End-to-end tests run on `main`, not on every pull request.** They are the slowest and heaviest job. Pull requests still get every other suite, which is where nearly all failures show up.
- **Only what changed is deployed.** A frontend-only change doesn't rebuild and redeploy the backend.
- **A newer push replaces a run in progress**, except on `main`, where a deploy is never cancelled half way.
- A failing end-to-end run uploads its Playwright report (screenshots and traces) as an artifact.
- The pipeline can also be started by hand (`workflow_dispatch`), which runs everything and deploys both sides.

---

## 5. Test policy

### When tests must be written
1. **New features** get tests at the levels that fit: unit tests for new logic, an integration test for new database behaviour or a new page, API tests for new or changed endpoints.
2. **New endpoints** must be added to `backend/tests/api/helpers/endpoints.js` with their allowed roles; the suite fails until they are.
3. **Every bug fix includes a test** that fails before the fix and passes after it, and is recorded in [bug-tracking.md](bug-tracking.md).
4. **Changes to permissions** always include API tests for both the allowed and the refused users.
5. **New critical user journeys** get an end-to-end test; smaller details stay with the faster suites.

### Before code is merged
1. All suites pass, along with lint, the test type-check and the build — CI runs these on every pull request.
2. No test is skipped, deleted or weakened to make a change pass. If expected behaviour changes, the reason goes in the pull request.
3. Coverage must not drop noticeably. Target: at least 90% of statements at unit level.
4. Another team member reviews the change, including its tests.

### How tests are written
1. **Independent:** each test creates its own data and never relies on another test. The test database is emptied before each one.
2. **No real external services:** Supabase and email are faked; no production data or credentials are ever used.
3. **Behaviour, not internals:** frontend tests find elements by role, label or visible text; backend tests check responses and stored data.
4. **Realistic data:** mocked responses match the backend's real shapes, and records are built with the shared factories.
5. **Clear names** that state the expected behaviour, e.g. "responds 403 to another organiser".
6. **Test code is reviewed and type-checked** like application code.

### When tests fail
1. A failure on `main` is fixed before anything else is merged.
2. A test that fails intermittently is investigated, not re-run until it passes.
3. Anything found during testing is logged in [bug-tracking.md](bug-tracking.md).

---

## 6. User feedback process

### Collecting feedback
1. **User testing sessions.** Before a release, people from each role work through set tasks ("create a round and upload its paper", "register three learners", "sit the exam and submit"). Observers note where they hesitate, go wrong or ask for help.
2. **Feedback form.** Afterwards each participant rates how easy each task was (1–5) and says what was confusing, what went wrong and what they would change.
3. **Ongoing reports.** Anyone can report a problem at any time, giving their role, the page, what they did, what they expected and what happened, with a screenshot where possible.

### Recording and triage
Every piece of feedback becomes an issue in the project's Gitea repository, labelled `bug`, `usability` or `feature request`, and given a priority:

| Priority | Meaning | Example |
|---|---|---|
| Critical | Data lost or exposed, or a core task impossible | Exam answers not saved; someone sees data they shouldn't |
| High | A core task works but gives wrong or confusing results | Wrong totals; an action that looks failed but succeeded |
| Medium | Inconvenient, with a workaround | An awkward field |
| Low | Cosmetic | Wording, spacing, pluralisation |

Issues are reviewed at the weekly team meeting, assigned and scheduled; critical ones are handled immediately.

### Acting on feedback
1. Reproduce the problem, and where possible write a test that shows it.
2. Fix it, with that test and all existing tests passing (see the [test policy](#5-test-policy)).
3. Record it in [bug-tracking.md](bug-tracking.md) and close the issue with a link to the change.
4. Confirm the fix with the person who reported it, or in the next user testing session.
5. Raise recurring themes at the weekly meeting and turn them into design improvements.
