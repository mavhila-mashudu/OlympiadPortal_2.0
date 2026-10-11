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
    // Each test file leaves a little module state behind in the shared worker
    // (a few dozen megabytes), and across seventeen files that is enough to
    // fill the CI runner's whole heap: the VM has about 1 GB of memory, so
    // Node caps its heap near 450 MB and the files at the end run out of
    // room. Recycle the worker when it grows past this limit, so they start
    // from a fresh heap again.
    workerIdleMemoryLimit: '300MB',
    coverageDirectory: 'coverage/api',
};
