# Backend image for Render (image-backed service).
# The app runs TypeScript directly through tsx, so there is no compile step and
# devDependencies (prisma CLI) are kept for `prisma migrate deploy` at startup.
#
# Debian-slim rather than alpine: npm's "Exit handler never called!" bug shows up
# far more often on alpine's musl libc, especially on slower/flakier networks like
# a shared CI runner talking to the npm registry.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
# --no-audit/--no-fund skip extra registry calls; the retry loop is a safety net
# for transient registry/network hiccups on the shared runner. `ok` tracks whether
# any attempt actually succeeded, so a full failure still fails the build loudly
# instead of silently continuing with no node_modules.
RUN ok=0; \
    for i in 1 2 3; do \
      npm ci --no-audit --no-fund && { ok=1; break; }; \
      echo "npm ci attempt $i failed, retrying..."; sleep 15; \
    done; \
    [ "$ok" = "1" ] || { echo "npm ci failed after 3 attempts"; exit 1; }; \
    npm cache clean --force

COPY . .

# generated/prisma is gitignored, so the client must be generated in the image.
# prisma.config.ts reads DIRECT_URL; a placeholder is enough for generate (no DB connection).
RUN DIRECT_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start:prod"]
