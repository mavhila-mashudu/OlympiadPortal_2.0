# Olympiad Portal — Backend API

A RESTful API for the Olympiad Portal platform, built for the Wits COMS3011A project.
The portal manages academic olympiad competitions between schools, educators, and students.

## Tech Stack

| Technology              | Purpose                              |
| ----------------------- | ------------------------------------ |
| Node.js                 | Runtime environment                  |
| Express.js              | Web framework                        |
| TypeScript + JavaScript | Language                             |
| Prisma ORM              | Database access and migrations       |
| Supabase                | PostgreSQL database + Authentication |
| tsx                     | TypeScript execution                 |

## Prerequisites

Before running this project, make sure you have:

- Node.js v18 or higher
- npm v8 or higher
- A Supabase account and project
- Git

## Getting Started

### 1. Clone the repository

```bash
git clone https://sdp.ms.wits.ac.za/prompt-engineers/OlympiadPortal_2.0.git
cd OlympiadPortal_2.0/backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in all required values.
See the Environment Variables section below for details on where to find each value.

### 4. Generate Prisma client

```bash
npx prisma generate
```

### 5. Run database migrations

```bash
npx prisma migrate dev
```

### 6. Start the development server

```bash
npm run dev
```

The server will start at `http://localhost:3000`

### 7. Verify the server is running

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2026-...",
  "environment": "development"
}
```

## Environment Variables

| Variable               | Description                     | Where to find it                       |
| ---------------------- | ------------------------------- | -------------------------------------- |
| `NODE_ENV`             | Environment name                | Set to `development` locally           |
| `PORT`                 | Server port                     | Set to `3000` locally                  |
| `FRONTEND_URL`         | Frontend URL for CORS           | `http://localhost:5173` locally        |
| `DATABASE_URL`         | Supabase pooled connection      | Supabase → Connect → ORMs → Prisma     |
| `DIRECT_URL`           | Supabase direct connection      | Supabase → Connect → ORMs → Prisma     |
| `SUPABASE_URL`         | Supabase project URL            | Supabase → Settings → API              |
| `SUPABASE_ANON_KEY`    | Supabase public key             | Supabase → Settings → API              |
| `SUPABASE_SERVICE_KEY` | Supabase service role key       | Supabase → Settings → API              |
| `ORGANISER_SECRET`     | Gate for organiser registration | Generate and share with team privately |

Generate `ORGANISER_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Project Structure

## Available Scripts

| Script          | Description                              |
| --------------- | ---------------------------------------- |
| `npm run dev`   | Start development server with hot reload |
| `npm run build` | Build for production                     |
| `npm start`     | Start production server                  |

## Database Scripts

| Script                                 | Description                    |
| -------------------------------------- | ------------------------------ |
| `npx prisma migrate dev`               | Run pending migrations         |
| `npx prisma migrate dev --name <name>` | Create and run a new migration |
| `npx prisma generate`                  | Regenerate Prisma client       |
| `npx prisma studio`                    | Open visual database browser   |

## API Overview

### Authentication

| Method | Endpoint                    | Description                   | Auth Required |
| ------ | --------------------------- | ----------------------------- | ------------- |
| POST   | `/auth/register/organiser`  | Register as organiser         | Secret key    |
| POST   | `/auth/register`            | Register with invitation code | Code          |
| GET    | `/auth/validate-code/:code` | Validate an invitation code   | No            |
| GET    | `/auth/me`                  | Get current user profile      | Yes           |
| DELETE | `/auth/account`             | Delete account                | Yes           |

### Invitations

| Method | Endpoint                       | Description                  | Auth Required |
| ------ | ------------------------------ | ---------------------------- | ------------- |
| POST   | `/auth/invite-school`          | Invite a school to olympiad  | Organiser     |
| POST   | `/auth/invite-educator`        | Invite an educator colleague | Educator      |
| POST   | `/auth/generate-student-codes` | Generate bulk student codes  | Educator      |

> Full API documentation is available on our documentation site.

## Database Schema

The database has 15 tables covering:

- **Users & Roles** — users, educators, entrants
- **Olympiad Structure** — olympiads, rounds, papers, questions
- **Participation** — schools, school_registrations, entrant_registrations
- **Submissions** — submissions, answers, results
- **Auth** — invitations

See `prisma/schema.prisma` for the full schema definition.

## Authentication Flow

This project uses **Supabase Authentication** for token management combined
with a custom invitation system for role-based registration.

All protected API routes require a valid Supabase JWT token in the
`Authorization: Bearer <token>` header.

## Contributing

See `CONTRIBUTING.md` for our Git workflow and branching strategy.

## Team

| Name      | Role             |
| --------- | ---------------- |
| Phumudzo  | Backend Lead     |
| Andile    | Frontend Lead    |
| Engedzani | Database / Auth  |
| Kedibone  | Frontend         |
| Mashudu   | Testing / DevOps |

## License

University of the Witwatersrand — COMS3011A Project 2026
