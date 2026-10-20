# GitHub CI/CD deployment

The repository is configured for a GitHub-based delivery pipeline:

1. A pull request or push to `main` or `master` runs the backend test suite and
   the frontend lint, test, and production-build checks.
2. Render waits for those GitHub checks to pass before deploying the API.
3. Vercel deploys the frontend from its GitHub integration. Pushes to its
   configured production branch create production deployments; other branches
   create preview deployments.

No deployment credential is stored in GitHub. Render and Vercel connect to the
repository directly, which keeps secrets in the hosting platforms.

## 1. Push the repository to GitHub

The GitHub repository root must be `OlympiadPortal_2.0` itself, which contains
`.github`, `render.yaml`, `backend`, and `frontend`. Keep either `master` (the
current local branch) or change the default branch to `main`; the workflow
supports both.

## 2. Create the Render backend

In Render, select **New > Blueprint** and connect the GitHub repository. Render
will detect the root-level `render.yaml` file. Create the Blueprint and provide
the prompted values:

| Variable | Value |
| --- | --- |
| `FRONTEND_URL` | Your final Vercel production URL, for example `https://olympiad-portal.vercel.app` |
| `DATABASE_URL` | Supabase pooled PostgreSQL connection string |
| `DIRECT_URL` | Supabase direct PostgreSQL connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key |
| `EMAILJS_*` | Your EmailJS settings, if email delivery is enabled |

The Blueprint uses the existing Dockerfile, runs Prisma migrations at startup,
and checks `GET /health` before making a deployment live. It only redeploys
when backend files change and the GitHub CI checks pass.

After the first deploy, copy the Render service URL, such as
`https://olympiad-portal-api.onrender.com`.

## 3. Create the Vercel frontend

In Vercel, select **Add New > Project**, import the same GitHub repository, and
set **Root Directory** to `frontend`. Vercel detects Vite; keep the build
command `npm run build` and output directory `dist` supplied by
`frontend/vercel.json`.

Set these **Production** environment variables before deploying:

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | The Render URL copied above, with no trailing slash |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |

Set the Vercel production branch to the same branch used for Render (`master`
or `main`). Redeploy after adding or changing a `VITE_*` value because Vite
embeds it in the production bundle.

## 4. Finish the connection

Once Vercel has its final production URL, set Render's `FRONTEND_URL` to that
exact URL (no trailing slash). This is required by the backend CORS policy.

Future pushes to the production branch now run CI first. A successful commit
deploys the backend via Render and the frontend via Vercel automatically.
