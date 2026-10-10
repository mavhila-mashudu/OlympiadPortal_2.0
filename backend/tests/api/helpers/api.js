// HTTP helpers for the API tests.
const request = require('supertest');
const app = require('../../../src/app');
const { supabase } = require('../../integration/helpers/externalMocks');

const TOKEN_PREFIX = 'test-token-';

// A bearer token Supabase (mocked) resolves to this user
const tokenFor = (user) => `${TOKEN_PREFIX}${user.id}`;

// Supabase Auth: test tokens map to their user id, anything else is rejected
const acceptTestTokens = () => {
    supabase.auth.getUser.mockImplementation(async (token) =>
        token?.startsWith(TOKEN_PREFIX)
            ? {
                  data: { user: { id: token.slice(TOKEN_PREFIX.length) } },
                  error: null,
              }
            : { data: { user: null }, error: { message: 'invalid JWT' } }
    );
};

// Unauthenticated request: api().get("/health")
const api = () => request(app);

// Authenticated request: as(organiser).post("/olympiads").send({...})
const as = (user) => {
    const withAuth = (method) => (path) =>
        request(app)
            [method](path)
            .set('Authorization', `Bearer ${tokenFor(user)}`);
    return {
        get: withAuth('get'),
        post: withAuth('post'),
        patch: withAuth('patch'),
        put: withAuth('put'),
        delete: withAuth('delete'),
    };
};

// Every error response uses the same envelope
const expectError = (res, status, message) => {
    expect({ status: res.status, body: res.body }).toEqual({
        status,
        body: {
            success: false,
            error:
                message instanceof RegExp
                    ? expect.stringMatching(message)
                    : message,
        },
    });
};

const expectOk = (res, status = 200) => {
    if (res.status !== status) {
        throw new Error(
            `Expected HTTP ${status} but got ${res.status}: ${JSON.stringify(res.body)}`
        );
    }
    expect(res.body.success).toBe(true);
    return res.body.data;
};

module.exports = { api, as, tokenFor, acceptTestTokens, expectError, expectOk };
