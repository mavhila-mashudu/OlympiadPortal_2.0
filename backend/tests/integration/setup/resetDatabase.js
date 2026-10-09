// Runs before every integration test file: each test starts with empty tables.
const prisma = require('../../../src/config/database').default;

const { hostname } = new URL(process.env.DATABASE_URL);
if (hostname !== '127.0.0.1') {
    // Refuse to wipe anything that isn't the local throwaway test database
    throw new Error(
        `Integration tests must use the local test database, not ${hostname}`
    );
}

let tableList;

beforeEach(async () => {
    if (!tableList) {
        const tables = await prisma.$queryRawUnsafe(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
        );
        tableList = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    }
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} CASCADE`);
});

afterAll(async () => {
    await prisma.$disconnect();
});
