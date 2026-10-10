import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is required to initialize Prisma');
}

// DATABASE_POOL_MAX caps how many connections the pool opens. It is left
// to the driver default in production; the end-to-end tests set it to 1
// because their database serves one connection at a time.
const poolMax = Number(process.env.DATABASE_POOL_MAX);

const adapter = new PrismaPg({
    connectionString,
    ...(Number.isFinite(poolMax) && poolMax > 0 ? { max: poolMax } : {}),
});

// Printing every SQL statement slows each request and floods the terminal,
// so query logging is opt-in (PRISMA_LOG_QUERIES=true) even in development.
const prisma = new PrismaClient({
    adapter,
    // Prisma gives up on a transaction that waits over 2s for a connection. In
    // the burst when a round closes, submissions queue for the pool, and that
    // limit would turn a busy moment into failed submissions; they wait longer
    // instead. A transaction may also run for longer once it has one.
    transactionOptions: { maxWait: 15_000, timeout: 20_000 },
    log:
        process.env.PRISMA_LOG_QUERIES === 'true'
            ? ['query', 'info', 'warn', 'error']
            : ['warn', 'error'],
});

process.on('beforeExit', async () => {
    await prisma.$disconnect();
});

export default prisma;
