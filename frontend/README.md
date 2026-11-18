# Olympiad Portal frontend

React and TypeScript single-page application built with Vite. It provides the public landing and account pages, plus role-based workspaces for organisers, educators, and students.

## Setup

Use Node.js 22 or newer. From this directory:

```bash
npm ci
cp .env.example .env
npm run dev
```

Set the following values in `.env`:

| Variable | Description |
| --- | --- |
| `VITE_API_URL` | Backend API URL, for local development `http://localhost:3000` |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anon key |

Vite serves the app at `http://localhost:5173` by default. The backend must also be configured and running; see [backend setup](../backend/README.md).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Type-check and create the production bundle in `dist/` |
| `npm run lint` | Run Oxlint |
| `npm test` | Run unit and integration tests |
| `npm run test:e2e` | Run Playwright browser tests |

For project-wide setup, architecture, documentation, and CI details, see the [repository README](../README.md).
