// The endpoint inventory, and the authentication/role rules for every
// protected endpoint. Ownership, validation and behaviour are tested per area
// in the other files.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const f = require('../integration/helpers/factories');
const { endpoints, mounts } = require('./helpers/endpoints');
const { api, as, expectError } = require('./helpers/api');

const ROLES = ['organiser', 'educator', 'student'];
const key = (method, route) =>
    `${method.toUpperCase()} ${route.replace(/:\w+/g, ':param')}`;

// A concrete URL for a route: every :param becomes a fresh UUID
const urlFor = (route) => route.replace(/:\w+/g, () => crypto.randomUUID());

describe('endpoint inventory', () => {
    it('lists every route defined in the route files and the app', () => {
        const routesDir = path.join(__dirname, '../../src/routes');
        const defined = new Set();

        for (const file of fs.readdirSync(routesDir)) {
            const source = fs.readFileSync(path.join(routesDir, file), 'utf8');
            for (const [, method, route] of source.matchAll(
                /router\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g
            )) {
                expect(mounts).toHaveProperty([file]);
                defined.add(
                    key(method, `${mounts[file]}${route === '/' ? '' : route}`)
                );
            }
        }
        const appSource = fs.readFileSync(
            path.join(__dirname, '../../src/app.js'),
            'utf8'
        );
        for (const [, method, route] of appSource.matchAll(
            /app\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g
        )) {
            defined.add(key(method, route));
        }

        const listed = endpoints.map((e) => key(e.method, e.path));
        expect(new Set(listed).size).toBe(listed.length);
        expect([...defined].sort()).toEqual([...listed].sort());
    });
});

describe('authentication and roles', () => {
    let users;
    beforeEach(async () => {
        const school = await f.createSchool();
        users = {
            organiser: await f.createOrganiser(),
            educator: (await f.createEducator({ school })).user,
            student: (await f.createStudent({ school })).user,
        };
    });

    const protectedEndpoints = endpoints.filter((e) => e.roles !== 'public');

    it.each(protectedEndpoints.map((e) => [e.method.toUpperCase(), e.path, e]))(
        '%s %s requires a token',
        async (_m, _p, endpoint) => {
            expectError(
                await api()[endpoint.method](urlFor(endpoint.path)),
                401,
                'No token provided'
            );
        }
    );

    const forbidden = protectedEndpoints.flatMap((e) =>
        e.roles === 'any'
            ? []
            : ROLES.filter((r) => !e.roles.includes(r)).map((role) => [
                  e.method.toUpperCase(),
                  e.path,
                  role,
                  e,
              ])
    );

    it.each(forbidden)(
        '%s %s refuses a signed-in %s with 403',
        async (_m, _p, role, endpoint) => {
            expectError(
                await as(users[role])[endpoint.method](urlFor(endpoint.path)),
                403,
                'Insufficient permissions'
            );
        }
    );

    it.each(
        endpoints
            .filter((e) => e.roles === 'public')
            .map((e) => [e.method.toUpperCase(), e.path, e])
    )('%s %s is reachable without a token', async (_m, _p, endpoint) => {
        const res = await api()
            [endpoint.method](urlFor(endpoint.path))
            .send({});
        expect([401, 403]).not.toContain(res.status);
    });
});
