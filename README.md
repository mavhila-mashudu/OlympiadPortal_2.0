# Olympiad Portal

A web platform for managing academic olympiad competitions between schools.
Built for COMS3011A at the University of the Witwatersrand, 2026.

## Project Structure

## Quick Start

See the README in each folder:

- [Backend Setup](./backend/README.md)
- [Frontend Setup](./frontend/README.md)

## Testing

The project has 2,064 automated tests across four levels:

| Level | What it checks | Where |
| --- | --- | --- |
| Unit | Single functions, components and hooks, with everything around them mocked | backend/tests/unit, frontend/tests/unit |
| Integration | Services against a real database, and whole pages inside the real app | backend/tests/integration, frontend/tests/integration |
| API | Every endpoint over real HTTP: responses, permissions and validation | backend/tests/api |
| End-to-end | Critical journeys in a real browser, front to back | frontend/e2e |

Run them locally (no database, `.env` file or internet connection needed):

```bash
cd backend  && npm test          # unit, integration and API tests
cd frontend && npm test          # unit and integration tests
cd frontend && npm run test:e2e  # end-to-end tests (first run: npx playwright install chromium)
```

### Test coverage

To see what percentage of the code the tests exercise, run a coverage report. Each command runs the tests, prints a summary table at the end (the percentage of statements, branches, functions and lines that ran), and writes a detailed report you can open in a browser.

**Backend** (from the `backend` folder):

```bash
npm run test:coverage               # unit tests        → coverage/index.html
npm run test:integration:coverage   # integration tests → coverage/integration/index.html
npm run test:api:coverage           # API tests         → coverage/api/index.html
```

**Frontend** (from the `frontend` folder):

```bash
npm run test:coverage:all   # unit and integration tests, every source file → coverage/index.html
npm run test:coverage       # unit tests only, leaving out the full pages
```

The summary at the end of a run looks like this:

```
Statements   : 77.41% ( 1906/2462 )
Branches     : 68.9% ( 1467/2129 )
Functions    : 76.21% ( 564/740 )
Lines        : 78.36% ( 1731/2209 )
```

In the HTML report, click through the folders to a file: lines the tests never ran are highlighted in red, and branches never taken in yellow. The `coverage` folders are generated, so don't commit them.

Coverage measured on 29 September 2026:

| Suite | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| Backend unit | 88.8% | 79.2% | 87.5% | 90.0% |
| Backend API | 80.9% | 65.3% | 77.5% | 82.8% |
| Backend integration | 67.3% | 53.0% | 64.9% | 70.4% |
| Frontend unit and integration (all source files) | 77.4% | 68.9% | 76.2% | 78.4% |

CI runs the backend and frontend suites on every pull request, and on pushes to `main` deploys to Azure once those checks have finished, whether they passed or not. The end-to-end tests aren't part of CI, so run them locally before merging a change to a user journey — see [.gitea/workflows/ci.yml](./.gitea/workflows/ci.yml).

Full details: [docs/testing.md](./docs/testing.md) · Known and fixed bugs: [docs/bug-tracking.md](./docs/bug-tracking.md)

## Documentation

Full project documentation:https://2846849.github.io/Olympiad-portal-documentation/

REST API reference: [docs/API.md](./docs/API.md)

Testing documentation: [docs/testing.md](./docs/testing.md)

## Team

Prompt Engineers — COMS3011A 2026
