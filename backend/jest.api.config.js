// API tests: real HTTP requests (Supertest) against the Express app, backed by
// the same throwaway Postgres as the integration suite (PGlite built from
// prisma/migrations). Only Supabase (auth + storage) and SMTP are faked.
const integration = require('./jest.integration.config');

/** @type {import('jest').Config} */
module.exports = {
    ...integration,
    displayName: 'api',
    roots: ['<rootDir>/tests/api'],
    setupFilesAfterEnv: [
        '<rootDir>/tests/integration/setup/resetDatabase.js',
        '<rootDir>/tests/integration/setup/mockHolidays.js',
        '<rootDir>/tests/api/setup/apiSetup.js',
    ],
    coverageDirectory: 'coverage/api',
};
