# Backend image for Render (image-backed service).
# The app runs TypeScript directly through tsx, so there is no compile step and
# devDependencies (prisma CLI) are kept for `prisma migrate deploy` at startup.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .

# generated/prisma is gitignored, so the client must be generated in the image.
# prisma.config.ts reads DIRECT_URL; a placeholder is enough for generate (no DB connection).
RUN DIRECT_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start:prod"]
