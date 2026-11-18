# Olympiad Portal

Olympiad Portal is a web platform for running school academic competitions. Organisers manage olympiads and rounds; educators register schools, prepare papers, and mark submissions; students sit exams and review results.

Built by the Prompt Engineers team for COMS3011A at the University of the Witwatersrand (2026).

## What it does

- Role-based workflows for organisers, educators, and students
- Olympiad, round, paper, question, and school registration management
- Online exam sitting, submissions, marking, results, and qualification tracking
- Invitations, notifications, moderation, and archived competition records
- Public API for developer integrations

## Architecture

| App | Stack | Location |
| --- | --- | --- |
| Frontend | React, TypeScript, Vite | `frontend/` |
| API | Express, TypeScript/JavaScript, Prisma | `backend/` |
| Data and authentication | PostgreSQL and Supabase Auth | Supabase |

## Run locally

Requirements: Node.js 22 or newer and npm. The API needs a Supabase project; create local environment files from the examples and provide the project credentials before starting the apps.

```bash
cd backend
npm ci
cp .env.example .env
npx prisma generate
npx prisma migrate dev
npm run dev
```

In a second terminal:

```bash
cd frontend
npm ci
cp .env.example .env
npm run dev
```

Set `VITE_API_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` in `frontend/.env`. Set the backend database, Supabase, and `FRONTEND_URL` values in `backend/.env`; see each app's README for details. The frontend runs at `http://localhost:5173`, and the API at `http://localhost:3000`.

## Quality checks

The repository includes backend unit, integration, and API suites; frontend unit and integration suites; and Playwright end-to-end journeys. CI runs backend tests plus frontend lint, tests, and production build on pull requests and pushes to `main` or `master`. End-to-end tests are run locally.

```bash
cd backend && npm test
cd frontend && npm run lint && npm test && npm run build
cd frontend && npm run test:e2e
```

See [testing documentation](./docs/testing.md) for suite details and [bug tracking](./docs/bug-tracking.md) for known issues.

## Documentation and delivery

- [System design](./docs/system-design.md)
- [REST API reference](./docs/API.md)
- [Testing and coverage](./docs/testing.md)
- [Deployment guide](./docs/deployment.md)
- [User stories](./docs/olympiad_portal_user_stories_by_role.md)
- [Project documentation site](https://2846849.github.io/Olympiad-portal-documentation/)
- [Trello work tracker](https://trello.com/b/5cHqfLX9/olympiadportal)

See [bug tracking](./docs/bug-tracking.md) for known issues.
## Team

Prompt Engineers — COMS3011A, University of the Witwatersrand, 2026.
