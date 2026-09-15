/**
 * CHARACTERIZATION — the authorization matrix, driven over real HTTP.
 *
 * `test/server/authorizer.test.js` is thorough but calls `authorizer.can(action,
 * scope)` directly, so it dies with the `Authorizer` class in task 15. This file
 * restates the SAME behavior as (actor role, action, resource state) →
 * allow | deny, observed through actual HTTP requests against a booted server.
 * It must therefore pass UNCHANGED against both the current controller stack and
 * the task-12 route middleware. That is the entire point.
 *
 * DENY CASES ARE THE VALUABLE HALF. An authorization test made only of allows
 * passes against middleware that permits everything — the single most dangerous
 * false pass in this project. Every level below has explicit denies.
 *
 * "Deny" here means HTTP 401 with the exact envelope { data: null, status:
 * 'unauthorized' }. "Allow" means the request reached the action, which is
 * asserted as a specific non-401 status.
 *
 * Consumed by tasks 12 and 15. The same table is written to
 * .ai/plans/server-ts/artifacts/authz-matrix.txt.
 *
 * FIDELITY, NOT CORRECTNESS: several assertions below pin behavior that is
 * arguably wrong (unauthenticated mat reads; 401-instead-of-404 for a missing
 * mat; judges unable to pause despite the `pause` permission existing for them).
 * They are pinned because they are what the server does today. See FINDINGS.md
 * F-11, F-15, F-16.
 */
const { afterAll, beforeAll, describe, expect, it } = require('bun:test');
const   Http = require('../helpers/httpServer');

// Must happen before anything opens a database connection.
Http.useTemporaryDatabase('accord-authz');

const UNAUTHORIZED = { data: null, status: 'unauthorized' };

let server;
let request;
let uniqueCounter = 0;


/** Creates a user and returns its api token. */
async function createUser(label) {
    const res = await request('POST', '/users', { body: { name: `${label}-${++uniqueCounter}` } });
    expect(res.status).toBe(200);
    return res.body.data.api_token;
}


/**
 * Builds an isolated fixture:
 *   creator  — created the mat, so mat.creator_id === creator (the "master")
 *   judge    — joined the mat with the ADMIN code, so a mat judge and, once the
 *              match starts, a match judge
 *   viewer   — joined with the VIEWER code
 *   outsider — authenticated, but unrelated to this mat
 *   anonymous— no token at all
 */
async function createWorld() {
    const creator  = await createUser('creator');
    const judge    = await createUser('judge');
    const viewer   = await createUser('viewer');
    const outsider = await createUser('outsider');

    const matRes = await request('POST', '/mats', { token: creator, body: { name: `Mat ${uniqueCounter}` } });
    expect(matRes.status).toBe(200);

    const mat        = matRes.body.data.mat;
    const adminCode  = mat.codes.find(c => c.role === 'admin').code;
    const viewerCode = mat.codes.find(c => c.role === 'viewer').code;

    expect((await request('POST', `/mat/${adminCode}/join`,  { token: judge  })).status).toBe(200);
    expect((await request('POST', `/mat/${viewerCode}/join`, { token: viewer })).status).toBe(200);

    return { creator, judge, viewer, outsider, mat, adminCode, viewerCode };
}


async function createMatch(world) {
    const res = await request('POST', `/mat/${world.adminCode}/matches`, {
        token: world.creator,
        body:  { red: { name: 'Red' }, blue: { name: 'Blue' } },
    });
    expect(res.status).toBe(200);
    return res.body.data.match;
}


async function createStartedMatch(world) {
    const match = await createMatch(world);
    expect((await request('POST', `/match/${match.id}/start`, { token: world.creator })).status).toBe(200);
    return match;
}


function expectDenied(res) {
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
}


beforeAll(async () => {
    await Http.migrate();
    const booted = await Http.startServer();
    server  = booted.server;
    request = Http.makeClient(booted.origin);
}, 30000);


afterAll(() => { if (server) server.close(); });


describe('CHARACTERIZATION: authorization matrix (over HTTP)', () => {

    /*******************************************************************************************
    * MAT SCOPE — create
    *******************************************************************************************/
    describe('Mat / create — POST /mats', () => {
        it('ALLOWS any authenticated user', async () => {
            const token = await createUser('any');
            const res   = await request('POST', '/mats', { token, body: { name: 'Mat' } });

            expect(res.status).toBe(200);
        });


        it('DENIES an anonymous request', async () => {
            // MatsController registers no authenticateRequest callback; the 401
            // comes from authorize('create', Mat) → Boolean(currentUser).
            expectDenied(await request('POST', '/mats', { body: { name: 'Mat' } }));
        });


        it('DENIES a request whose api token does not resolve to a user', async () => {
            expectDenied(await request('POST', '/mats', {
                token: '00000000-0000-0000-0000-000000000000',
                body:  { name: 'Mat' },
            }));
        });
    });


    /*******************************************************************************************
    * MAT SCOPE — view
    *******************************************************************************************/
    describe('Mat / view — GET /mat/:matId', () => {
        let world;
        beforeAll(async () => { world = await createWorld(); });


        it('ALLOWS the mat creator', async () => {
            expect((await request('GET', `/mat/${world.mat.id}`, { token: world.creator })).status).toBe(200);
        });


        it('ALLOWS an unrelated authenticated user — `view` on a Mat is unconditional', async () => {
            expect((await request('GET', `/mat/${world.mat.id}`, { token: world.outsider })).status).toBe(200);
        });


        // FIDELITY: this endpoint is effectively public. Pinned, not endorsed.
        // See FINDINGS.md F-15.
        it('ALLOWS an ANONYMOUS request — this route requires no authentication at all', async () => {
            const res = await request('GET', `/mat/${world.mat.id}`);

            expect(res.status).toBe(200);
            expect(res.body.data.mat.id).toBe(world.mat.id);
        });


        it('ALLOWS lookup by word-code as well as by id', async () => {
            const res = await request('GET', `/mat/${world.adminCode}`);

            expect(res.status).toBe(200);
            expect(res.body.data.mat.id).toBe(world.mat.id);
        });


        // FIDELITY: `can(action, scope)` returns false for a null scope, so a
        // missing mat is reported as 401, not 404. See FINDINGS.md F-16.
        it('DENIES (401, not 404) when the mat id does not exist', async () => {
            expectDenied(await request('GET', '/mat/550e8400-e29b-41d4-a716-446655440000', { token: world.creator }));
        });
    });


    /*******************************************************************************************
    * MAT SCOPE — assign / be assigned judge (join + roster reads)
    *******************************************************************************************/
    describe('Mat / assign + be assigned judge — mat membership', () => {
        let world;
        beforeAll(async () => { world = await createWorld(); });


        it('ALLOWS joining with an ADMIN code — `assign` and `be assigned judge` both pass', async () => {
            const token = await createUser('joiner');
            expect((await request('POST', `/mat/${world.adminCode}/join`, { token })).status).toBe(200);
        });


        it('ALLOWS joining with an ADMIN code and NO token, creating an anonymous user', async () => {
            const res = await request('POST', `/mat/${world.adminCode}/join`, { body: { name: 'Walk-in' } });

            expect(res.status).toBe(200);
            expect(res.body.data.api_token).toEqual(expect.any(String));
        });


        it('ALLOWS joining with a VIEWER code — the viewer branch performs no authorize() at all', async () => {
            const token = await createUser('watcher');
            expect((await request('POST', `/mat/${world.viewerCode}/join`, { token })).status).toBe(200);
        });


        it('ALLOWS any authenticated user to read the judge and viewer rosters', async () => {
            expect((await request('GET', `/mat/${world.adminCode}/judges`,  { token: world.outsider })).status).toBe(200);
            expect((await request('GET', `/mat/${world.viewerCode}/viewers`, { token: world.outsider })).status).toBe(200);
        });


        it('DENIES an anonymous roster read', async () => {
            expectDenied(await request('GET', `/mat/${world.adminCode}/judges`));
            expectDenied(await request('GET', `/mat/${world.adminCode}/viewers`));
        });


        it('DENIES an anonymous leave request', async () => {
            expectDenied(await request('DELETE', `/mat/${world.adminCode}/join`));
        });


        // An unresolvable code yields no currentMat, which the mat-scoped
        // UsersController reports as 404 rather than 401 — the opposite of the
        // Mat/view case above.
        it('reports 404 (not 401) for a code that resolves to no mat', async () => {
            const res = await request('GET', '/mat/no.such.code/judges', { token: world.creator });

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ data: null, status: 'not found' });
        });
    });


    /*******************************************************************************************
    * MAT SCOPE — create a match
    *******************************************************************************************/
    describe('Mat / create a match — POST /mat/:matCode/matches', () => {
        let world;
        const competitors = { red: { name: 'Red' }, blue: { name: 'Blue' } };

        beforeAll(async () => { world = await createWorld(); });


        it('ALLOWS the mat creator holding the ADMIN code', async () => {
            const res = await request('POST', `/mat/${world.adminCode}/matches`, { token: world.creator, body: competitors });
            expect(res.status).toBe(200);
        });


        // The permission is attached to the CODE, not to mat membership: anyone
        // who knows the admin code may create a match on that mat.
        it('ALLOWS an unrelated authenticated user holding the ADMIN code', async () => {
            const res = await request('POST', `/mat/${world.adminCode}/matches`, { token: world.outsider, body: competitors });
            expect(res.status).toBe(200);
        });


        it('DENIES the mat creator when the VIEWER code is used', async () => {
            expectDenied(await request('POST', `/mat/${world.viewerCode}/matches`, { token: world.creator, body: competitors }));
        });


        it('DENIES a mat judge when the VIEWER code is used', async () => {
            expectDenied(await request('POST', `/mat/${world.viewerCode}/matches`, { token: world.judge, body: competitors }));
        });


        it('DENIES an anonymous request even with the ADMIN code', async () => {
            expectDenied(await request('POST', `/mat/${world.adminCode}/matches`, { body: competitors }));
        });
    });


    /*******************************************************************************************
    * USER SCOPE — assign
    *******************************************************************************************/
    describe('User / assign — assigning competitors', () => {
        let world;
        beforeAll(async () => { world = await createWorld(); });


        // Authorizer#userPermission('assign') is unconditionally true, so any
        // existing user may be named as a competitor by anyone who can create
        // the match.
        it('ALLOWS assigning an arbitrary EXISTING user as a competitor', async () => {
            const strangerRes = await request('POST', '/users', { body: { name: 'Stranger' } });
            const strangerId  = strangerRes.body.data.user.id;

            const res = await request('POST', `/mat/${world.adminCode}/matches`, {
                token: world.creator,
                body:  { red: { id: strangerId }, blue: { name: 'Blue' } },
            });

            expect(res.status).toBe(200);
            expect(res.body.data.match.red_competitor.id).toBe(strangerId);
        });


        it('ALLOWS assigning brand-new users by name', async () => {
            const res = await request('POST', `/mat/${world.adminCode}/matches`, {
                token: world.creator,
                body:  { red: { name: 'Fresh Red' }, blue: { name: 'Fresh Blue' } },
            });
            expect(res.status).toBe(200);
        });
    });


    /*******************************************************************************************
    * MATCH SCOPE — view
    *******************************************************************************************/
    describe('Match / view — GET /match/:matchId', () => {
        let world, match;
        beforeAll(async () => {
            world = await createWorld();
            match = await createMatch(world);
        });


        it('ALLOWS the mat creator', async () => {
            expect((await request('GET', `/match/${match.id}`, { token: world.creator })).status).toBe(200);
        });


        it('ALLOWS a match judge', async () => {
            expect((await request('GET', `/match/${match.id}`, { token: world.judge })).status).toBe(200);
        });


        it('ALLOWS a mat viewer', async () => {
            expect((await request('GET', `/match/${match.id}`, { token: world.viewer })).status).toBe(200);
        });


        it('ALLOWS an unrelated authenticated user — `view` on a Match is unconditional', async () => {
            expect((await request('GET', `/match/${match.id}`, { token: world.outsider })).status).toBe(200);
        });


        it('DENIES an anonymous request — unlike Mat/view, this route authenticates', async () => {
            expectDenied(await request('GET', `/match/${match.id}`));
        });


        it('reports 404 for a match id that does not exist', async () => {
            const res = await request('GET', '/match/550e8400-e29b-41d4-a716-446655440000', { token: world.creator });
            expect(res.status).toBe(404);
        });
    });


    /*******************************************************************************************
    * MATCH SCOPE — manage
    *******************************************************************************************/
    describe('Match / manage — start, end, and all round administration', () => {
        let world;
        beforeAll(async () => { world = await createWorld(); });


        it('ALLOWS the mat creator to start and end a match', async () => {
            const match = await createMatch(world);

            expect((await request('POST', `/match/${match.id}/start`, { token: world.creator })).status).toBe(200);
            expect((await request('POST', `/match/${match.id}/end`,   { token: world.creator })).status).toBe(200);
        });


        it('DENIES a match judge', async () => {
            const match = await createMatch(world);

            expectDenied(await request('POST', `/match/${match.id}/start`, { token: world.judge }));
            expectDenied(await request('POST', `/match/${match.id}/end`,   { token: world.judge }));
        });


        it('DENIES a mat viewer', async () => {
            const match = await createMatch(world);
            expectDenied(await request('POST', `/match/${match.id}/start`, { token: world.viewer }));
        });


        it('DENIES an unrelated authenticated user', async () => {
            const match = await createMatch(world);
            expectDenied(await request('POST', `/match/${match.id}/start`, { token: world.outsider }));
        });


        it('DENIES an anonymous request', async () => {
            const match = await createMatch(world);
            expectDenied(await request('POST', `/match/${match.id}/start`));
        });


        // RoundsController#authenticateMatch authorizes 'manage' for EVERY
        // action on the controller, so round administration is master-only.
        it('DENIES a match judge every round-administration route', async () => {
            const match = await createStartedMatch(world);

            expectDenied(await request('POST',  `/match/${match.id}/rounds`,        { token: world.judge }));
            expectDenied(await request('POST',  `/match/${match.id}/rounds/end`,    { token: world.judge }));
            expectDenied(await request('PATCH', `/match/${match.id}/rounds/result`, { token: world.judge, body: { winner: 'red' } }));
        });


        it('ALLOWS the mat creator to end a round', async () => {
            const match = await createStartedMatch(world);
            expect((await request('POST', `/match/${match.id}/rounds/end`, { token: world.creator })).status).toBe(200);
        });
    });


    /*******************************************************************************************
    * MATCH SCOPE — pause
    *******************************************************************************************/
    describe('Match / pause — POST /match/:matchId/rounds/pause and /resume', () => {
        let world;
        beforeAll(async () => { world = await createWorld(); });


        it('ALLOWS the mat creator to pause and resume', async () => {
            const match = await createStartedMatch(world);

            expect((await request('POST', `/match/${match.id}/rounds/pause`,  { token: world.creator })).status).toBe(200);
            expect((await request('POST', `/match/${match.id}/rounds/resume`, { token: world.creator })).status).toBe(200);
        });


        // FIDELITY / KNOWN BUG — FINDINGS.md F-11.
        //
        // Authorizer grants `pause` to judges as well as to the mat creator
        // ("allows a judge (non-creator) to pause" in authorizer.test.js), but
        // RoundsController#authenticateMatch runs FIRST and requires `manage`,
        // so a judge is rejected before authorize('pause') is ever reached. The
        // `pause` permission's judge branch is therefore dead over HTTP.
        //
        // This assertion is what the server does, not what it should do. If a
        // rewrite makes judges able to pause, this test failing is CORRECT and
        // the change must be made deliberately in task 18.
        it('DENIES a match judge — despite the `pause` permission granting judges access', async () => {
            const match = await createStartedMatch(world);

            expectDenied(await request('POST', `/match/${match.id}/rounds/pause`,  { token: world.judge }));
            expectDenied(await request('POST', `/match/${match.id}/rounds/resume`, { token: world.judge }));
        });


        it('DENIES an unrelated authenticated user', async () => {
            const match = await createStartedMatch(world);
            expectDenied(await request('POST', `/match/${match.id}/rounds/pause`, { token: world.outsider }));
        });


        it('DENIES an anonymous request', async () => {
            const match = await createStartedMatch(world);
            expectDenied(await request('POST', `/match/${match.id}/rounds/pause`));
        });
    });


    /*******************************************************************************************
    * MATCH SCOPE — judge
    *******************************************************************************************/
    describe('Match / judge — riding time votes', () => {
        let world;
        beforeAll(async () => { world = await createWorld(); });


        it('ALLOWS a match judge to start and end a riding time vote', async () => {
            const match = await createStartedMatch(world);

            expect((await request('POST',   `/match/${match.id}/ridingTime`,          { token: world.judge, body: { rider: 'red' } })).status).toBe(200);
            expect((await request('DELETE', `/match/${match.id}/ridingTime?rider=red`, { token: world.judge })).status).toBe(200);
        });


        // The mat creator is the master, not a judge — creating a mat does not
        // enrol you as one of its judges, and Match#start() copies the judge
        // list from the mat.
        it('DENIES the mat creator, who is the master but not a judge', async () => {
            const match = await createStartedMatch(world);
            expectDenied(await request('POST', `/match/${match.id}/ridingTime`, { token: world.creator, body: { rider: 'red' } }));
        });


        it('DENIES a mat viewer', async () => {
            const match = await createStartedMatch(world);
            expectDenied(await request('POST', `/match/${match.id}/ridingTime`, { token: world.viewer, body: { rider: 'red' } }));
        });


        it('DENIES an unrelated authenticated user', async () => {
            const match = await createStartedMatch(world);
            expectDenied(await request('POST', `/match/${match.id}/ridingTime`, { token: world.outsider, body: { rider: 'red' } }));
        });


        it('DENIES an anonymous request', async () => {
            const match = await createStartedMatch(world);
            expectDenied(await request('POST', `/match/${match.id}/ridingTime`, { body: { rider: 'red' } }));
        });


        // ORDERING: RidingTimeVoteController#authenticateMatch checks for an
        // active round BEFORE authorize('judge'), so with no open round even an
        // unauthorized actor receives 400 rather than 401.
        it('returns 400 (not 401) when there is no active round, even for a non-judge', async () => {
            const match = await createMatch(world);   // created but never started

            const asOutsider = await request('POST', `/match/${match.id}/ridingTime`, { token: world.outsider, body: { rider: 'red' } });
            expect(asOutsider.status).toBe(400);
            expect(asOutsider.body).toEqual({ data: { errors: { matchId: ['no active round available'] } }, status: 'bad request' });
        });
    });


    /*******************************************************************************************
    * STRING SCOPE
    *******************************************************************************************/
    describe('String scope — `authenticated` / `unauthenticated` / `test`', () => {
        it('has no HTTP call sites, so nothing is pinned here', () => {
            // Authorizer#simpleScopePermission handles string scopes, but no
            // controller calls authorize() with a string. authorizer.test.js's
            // 'test' scope cases exercise the class directly and have no HTTP
            // equivalent — deliberately not restated.
            expect(true).toBe(true);
        });
    });
});
