# Olympiad Portal

A web platform for managing academic olympiad competitions between schools.
Built for COMS3011A at the University of the Witwatersrand, 2026.

## Project Structure

## Quick Start

See the README in each folder:

- [Backend Setup](./backend/README.md)
- [Frontend Setup](./frontend/README.md)

## Testing

The project has 1,654 automated tests across four levels:

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

CI runs the same suites on every pull request, adds the end-to-end tests on pushes to `main`, and deploys only if they all pass — see [.gitea/workflows/ci.yml](./.gitea/workflows/ci.yml).

Full details: [docs/testing.md](./docs/testing.md) · Known and fixed bugs: [docs/bug-tracking.md](./docs/bug-tracking.md)

## Documentation

Full project documentation:https://2846849.github.io/Olympiad-portal-documentation/

REST API reference: [docs/API.md](./docs/API.md)

Testing documentation: [docs/testing.md](./docs/testing.md)

## Team

Prompt Engineers — COMS3011A 2026
