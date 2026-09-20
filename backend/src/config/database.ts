import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to initialize Prisma");
}

// DATABASE_POOL_MAX caps how many connections the pool opens. It is left
// to the driver default in production; the end-to-end tests set it to 1
// because their database serves one connection at a time.
const poolMax = Number(process.env.DATABASE_POOL_MAX);

const adapter = new PrismaPg({
  connectionString,
  ...(Number.isFinite(poolMax) && poolMax > 0 ? { max: poolMax } : {}),
});

const prisma = new PrismaClient({
  adapter,
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "info", "warn", "error"]
      : ["warn", "error"],
});

process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

export default prisma;
