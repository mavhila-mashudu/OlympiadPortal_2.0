// Integration tests: real services + real Prisma client + a real Postgres
// database (PGlite, in-process) built from prisma/migrations. Only external
// services (Supabase Auth/Storage, SMTP) are mocked.
const path = require('node:path');

/** @type {import('jest').Config} */
module.exports = {
    displayName: 'integration',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests/integration'],
    testMatch: ['**/*.test.js'],
    globalSetup: '<rootDir>/tests/integration/setup/globalSetup.js',
    globalTeardown: '<rootDir>/tests/integration/setup/globalTeardown.js',
    setupFilesAfterEnv: [
        '<rootDir>/tests/integration/setup/resetDatabase.js',
        '<rootDir>/tests/integration/setup/mockHolidays.js',
    ],
    // One shared database, so test files run one at a time
    maxWorkers: 1,
    testTimeout: 30_000,
    transform: {
        // TypeScript sources and Prisma's generated client (ES modules with
        // import.meta.url) are converted to CommonJS for Jest
        '\\.ts$': [
            'babel-jest',
            {
                presets: ['@babel/preset-typescript'],
                plugins: [
                    '@babel/plugin-transform-export-namespace-from',
                    '@babel/plugin-transform-modules-commonjs',
                    'babel-plugin-transform-import-meta',
                    path.join(
                        __dirname,
                        'tests/integration/setup/babelDynamicImportToRequire.js'
                    ),
                ],
            },
        ],
    },
    moduleNameMapper: {
        // The generated client imports its own .ts files with ".js" extensions
        '^(\\.{1,2}/.*)\\.js$': '$1',
        // ...and loads Prisma's query compiler as .mjs; Prisma ships CommonJS
        // builds of the same files alongside them
        '^@prisma/client/runtime/(.*)\\.mjs$': '@prisma/client/runtime/$1.js',
    },
    collectCoverageFrom: ['src/**/*.{js,ts}'],
    coverageDirectory: 'coverage/integration',
};
