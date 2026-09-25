# Third-Party Code Documentation

> **Purpose:** Describe the external software and services used by the project, why they were chosen, and where they are used.

## Scope

This document covers the direct dependencies listed in `backend/package.json` and
`frontend/package.json`, together with the external services used by the
deployed application.

The project uses a hand-written API for its main application features. Supabase
provides authentication and file storage, while application data and competition
rules are handled through the Express API and Prisma services.

## Backend Dependencies

| Dependency | Type | Use in this project | Selection rationale |
| --- | --- | --- | --- |
| `express` | Runtime | HTTP server, middleware, routes, and API responses in `backend/src/app.js` and `backend/src/routes` | Lightweight and provides direct control over the hand-written REST API. |
| `@prisma/client` | Runtime | Database queries and transactions in `backend/src/config/database.ts` and `backend/src/services` | Provides a generated database client, relational queries, and transaction support for submissions and marking. |
| `prisma` | Development | Schema generation, migrations, and database tooling | Keeps database structure version-controlled through `backend/prisma/schema.prisma` and migration files. |
| `@prisma/adapter-pg` | Runtime | Connects Prisma 7 to the PostgreSQL driver | Connects Prisma to the PostgreSQL driver used by the backend. |
| `pg` | Runtime | PostgreSQL connection pooling | Provides the database connection pool used by the Prisma adapter. |
| `@supabase/supabase-js` | Runtime | Verifies bearer tokens and creates signed storage URLs in `config/supabase.js`, `middlewares/auth.js`, and `services/paperService.js` | Uses an established identity and storage provider instead of implementing custom password hashing or JWT verification. |
| `helmet` | Runtime | Security headers in `backend/src/app.js` | Adds standard HTTP hardening with minimal application code. |
| `cors` | Runtime | Restricts browser origins in `backend/src/app.js` | Allows the separately deployed frontend to call the API while limiting unapproved origins. |
| `express-validator` | Runtime | Validates request bodies and route parameters in `backend/src/routes` | Checks input before it reaches the service layer and database. |
| `dotenv` | Runtime | Loads environment configuration in `backend/src/config/env.js` | Keeps credentials and deployment-specific values outside source code. |
| `multer` | Runtime | Receives multipart paper and memo uploads | Provides Express-compatible multipart parsing before files are sent to Supabase Storage. |
| `nodemailer` | Runtime | Sends school, educator, and student invitations in `backend/src/lib/mailer.ts` | Supports standard SMTP providers without coupling the application to one email vendor. |
| `tsx` | Runtime/tooling | Runs the mixed TypeScript/JavaScript backend and development watcher | Allows the backend to run TypeScript directly without a separate build step. |
| `typescript` | Tooling | Type-checks TypeScript files and supports editor tooling | Adds compile-time checks to the TypeScript portions of the backend. |
| `ws` | Runtime | Supplies the WebSocket implementation configured for the Supabase Node client | Makes the Supabase client usable in the Node.js server environment. |
| `@types/express`, `@types/node`, `@types/pg`, `@types/cors`, `@types/nodemailer` | Tooling | Type declarations for JavaScript libraries and Node APIs | Provides type information for the TypeScript parts of the backend. |

### Backend integration notes

- Express routes call controllers, and controllers pass application logic to services.
- Prisma is used to access the data for users, schools, olympiads, rounds,
  questions, submissions, answers, and results.
- Supabase Auth handles credentials and token verification. The local
  `users` table stores application roles and relationships.
- Supabase Storage stores paper and memo files. The database stores their object
  paths rather than the files themselves.
- Nodemailer sends invitation messages through configured SMTP credentials. In
  development, the mailer logs invitation details when SMTP is not configured.

## Frontend Dependencies

| Dependency | Type | Use in this project | Selection rationale |
| --- | --- | --- | --- |
| `react` | Runtime | Components and pages under `frontend/src` | Supports reusable interfaces for organiser, educator, and student workflows. |
| `react-dom` | Runtime | Mounts the React application in `frontend/src/main.tsx` | Standard browser renderer for React. |
| `react-router-dom` | Runtime | Client-side routes, route parameters, links, and navigation in `frontend/src/App.tsx` | Provides navigation between pages without full page reloads. |
| `@tanstack/react-query` | Runtime | Query client and educator data hooks | Helps load, cache, refresh, and update data from the API. |
| `@supabase/supabase-js` | Runtime | Browser sign-in and Supabase session access in `frontend/src/lib/supabase.ts` and auth pages | Reuses the same established identity provider as the backend. |
| `lucide-react` | Runtime | Icons in navigation, forms, exam controls, and status interfaces | Provides a consistent icon set as importable React components. |
| `vite` | Development | Development server and production bundling | Fast development feedback and a simple static build suitable for any static host. |
| `@vitejs/plugin-react` | Development | React support for Vite | Connects React and JSX/TSX processing to the Vite build. |
| `typescript` | Development | Frontend type checking during `npm run build` | Detects type errors before the static bundle is produced. |
| `oxlint` | Development | Frontend linting through `npm run lint` | Provides fast static analysis for common code-quality issues. |
| `@types/react`, `@types/react-dom`, `@types/node` | Development | Type declarations for React, the DOM, and Node tooling | Supports TypeScript checking and editor assistance. |

### Frontend integration notes

- `frontend/src/lib/api.ts` is the HTTP client used by pages and hooks. It
  attaches the stored Supabase access token to API requests.
- React Router controls page navigation. Backend middleware checks API
  authorization; the frontend currently relies on the API for access control.
- React Query is configured in `frontend/src/main.tsx` and used by selected
  educator data hooks. Many pages still use direct API calls.
- Vite produces the static frontend bundle used by the deployment platform.

## External Services And Infrastructure

| Service or tool | Integration | Why it is used |
| --- | --- | --- |
| Supabase Auth | User registration, sign-in, access tokens, and account deletion | Satisfies the requirement to use an established authentication system. |
| Supabase PostgreSQL | Persistent relational data accessed through Prisma | Provides managed PostgreSQL while preserving a hand-written API boundary. |
| Supabase Storage | Private `papers` bucket and time-limited signed URLs | Stores large exam documents separately from relational records. |
| SMTP provider | Invitation email delivery through Nodemailer | Allows invitations to reach schools, educators, and students. |
| Docker `node:22-bookworm-slim` | Production backend image in `backend/Dockerfile` | Provides a reproducible Node.js runtime with the libraries required by the backend. |
| Azure App Service | Backend hosting | Runs the Express API on a Linux Node 22 plan; the deploy pipeline ships the built application to it. |
| Azure Storage (static website) | Frontend hosting | Serves the Vite-generated static SPA from the `$web` container, falling back to `index.html` so client-side routes resolve. |
| Gitea Actions | Repository automation configuration under `.gitea` | Automates backend image builds and deployment workflows. |

## Selection Decisions

### Why Supabase instead of custom authentication?

The project requires an established authentication solution. Supabase handles
credential storage and token issuance, while the application manages roles,
invitations, school membership, and authorization in its own database and
Express middleware.

### Why Prisma instead of direct SQL everywhere?

The domain contains many related records and multi-step operations. Prisma
provides relational queries, generated client types, migrations, and
transactions. The application still controls the schema and business rules
instead of exposing automatically generated CRUD endpoints.

### Why Express instead of a larger backend framework?

The application uses a relatively small REST API with separate routes,
controllers, services, and middleware. Express supports this structure without
adding a larger framework that the project does not need.

### Why Vite instead of Create React App?

Vite provides the development server and production build for the React SPA.
It also fits the separate frontend and backend structure.

## Licensing

The project uses open-source packages. The main licenses used by these
packages are MIT, Apache-2.0, BSD, and ISC.

The package versions and their license information are recorded in the package
manifests and lockfiles.

