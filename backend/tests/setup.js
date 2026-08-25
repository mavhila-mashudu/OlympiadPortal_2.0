// Set required env vars before any app modules load.
// These are dummy values — tests must NOT touch the real database.
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy";
process.env.DIRECT_URL =
  process.env.DIRECT_URL || "postgresql://dummy:dummy@localhost:5432/dummy";
process.env.ORGANISER_SECRET = process.env.ORGANISER_SECRET || "test-secret";
process.env.SUPABASE_URL =
  process.env.SUPABASE_URL || "https://test.supabase.co";
process.env.SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || "test-service-key";
process.env.NODE_ENV = "test";
