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

### 7. Create the first organiser

Organisers can't sign themselves up: the role controls every olympiad the
account owns, so the portal administrator creates each one from the command
line, using the same `.env` as the server:

```bash
npm run create-organiser -- "Thandi Mokoena" thandi@example.com
```

A random temporary password is printed once (or set `ORGANISER_PASSWORD`
yourself). The organiser can change it with "Forgot password" on the login page.

### 8. Verify the server is running

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

| Variable               | Description                | Where to find it                   |
| ---------------------- | -------------------------- | ---------------------------------- |
| `NODE_ENV`             | Environment name           | Set to `development` locally       |
| `PORT`                 | Server port                | Set to `3000` locally              |
| `FRONTEND_URL`         | Frontend URL for CORS      | `http://localhost:5173` locally    |
| `DATABASE_URL`         | Supabase pooled connection | Supabase → Connect → ORMs → Prisma |
| `DIRECT_URL`           | Supabase direct connection | Supabase → Connect → ORMs → Prisma |
| `SUPABASE_URL`         | Supabase project URL       | Supabase → Settings → API          |
| `SUPABASE_ANON_KEY`    | Supabase public key        | Supabase → Settings → API          |
| `SUPABASE_SERVICE_KEY` | Supabase service role key  | Supabase → Settings → API          |

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

| Method | Endpoint         | Description                    | Auth Required |
| ------ | ---------------- | ------------------------------ | ------------- |
| POST   | `/auth/register` | Sign up as educator or student | No            |
| GET    | `/schools`       | Schools for the signup form    | No            |
| GET    | `/me`            | Get current user profile       | Yes           |
| DELETE | `/me`            | Delete account                 | Yes           |

### Invitations

Invitations are delivered in the app, not by email, and go only to people who
already have an account. Accepting one registers an educator's school for the
olympiad, or enters a student into its rounds.

| Method | Endpoint                                     | Description                   | Auth Required       |
| ------ | -------------------------------------------- | ----------------------------- | ------------------- |
| GET    | `/me/olympiad-invitations`                   | Invitations addressed to me   | Yes                 |
| GET    | `/me/sent-olympiad-invitations`              | Invitations I have sent       | Organiser, educator |
| GET    | `/me/olympiad-invitation-candidates`         | Who I may still invite        | Organiser, educator |
| POST   | `/olympiad-invitations`                      | Invite someone to an olympiad | Organiser, educator |
| POST   | `/olympiad-invitations/:invitationId/accept` | Accept an invitation          | Yes (the invitee)   |
| POST   | `/olympiad-invitations/:invitationId/reject` | Decline an invitation         | Yes (the invitee)   |
| DELETE | `/olympiad-invitations/:invitationId`        | Withdraw an invitation I sent | Organiser, educator |

> Full API documentation is available on our documentation site.

## Database Schema

The database has 15 tables covering:

- **Users & Roles** — users, educators, entrants
- **Olympiad Structure** — olympiads, rounds, papers, questions
- **Participation** — schools, school_registrations, entrant_registrations
- **Submissions** — submissions, answers, results
- **Invitations** — olympiad_invites

See `prisma/schema.prisma` for the full schema definition.

## Authentication Flow

This project uses **Supabase Authentication** for token management.
Registration is open to educators and students, without an invitation; they
name the school they belong to, and take part in a particular olympiad by
accepting an in-app invitation. Organiser accounts are created by the portal
administrator (`npm run create-organiser`), never through public sign-up.

All protected API routes require a valid Supabase JWT token in the
`Authorization: Bearer <token>` header.

## Contributing

See `CONTRIBUTING.md` for our Git workflow and branching strategy.

## Team

| Name        | Role             |
| ----------- | ---------------- |
| Phumudzo    | Backend Lead     |
| Andile      | Frontend Lead    |
| Engedzani   | Database / Auth  |
| Kedibone    | Frontend         |
| Mashudu     | Testing / DevOps |
| Nhlakanipho | Tools            |

## License

University of the Witwatersrand — COMS3011A Project 2026
