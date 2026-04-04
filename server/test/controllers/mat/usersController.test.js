/**
 * Tests for mat/UsersController (controllers/mat/usersController.js)
 *
 * All DB / model interactions are mocked so no live database is needed.
 * We instantiate the controller directly with fake request/response objects,
 * then spy on the private-state getters (currentMat, currentMatCode,
 * currentUser, authorize) to drive each test case.
 */

const { UsersController } = require('../../../controllers/mat/usersController');
const { MatCode }         = require('../../../models/matCode');


// ---------------------------------------------------------------------------
// Minimal request/response stubs (mirrors jest-express shape used elsewhere)
// ---------------------------------------------------------------------------
function makeRequest(overrides = {}) {
    return {
        params:  {},
        body:    {},
        query:   {},
        headers: {},
        ...overrides,
    };
}

function makeResponse() {
    return {
        json:       jest.fn(),
        statusCode: 200,
        set:        jest.fn(),
        send:       jest.fn(),
    };
}


// ---------------------------------------------------------------------------
// Factory: build a controller and wire up the spies that represent the
// "already-resolved" state normally set by setupRequestState().
// ---------------------------------------------------------------------------
function makeController({ mat, matCode, user } = {}) {
    const req        = makeRequest();
    const res        = makeResponse();
    const controller = new UsersController(req, res);

    // currentUser has a public setter
    if (user !== undefined) controller.currentUser = user;

    // currentMat and currentMatCode only have getters; spy on them
    if (mat !== undefined) {
        jest.spyOn(controller, 'currentMat', 'get').mockReturnValue(mat);
    }

    if (matCode !== undefined) {
        jest.spyOn(controller, 'currentMatCode', 'get').mockReturnValue(matCode);
    }

    // Stub render / renderErrors so we can capture calls without running the
    // full JSON-formatting pipeline (which needs real model instances).
    controller.render       = jest.fn().mockImplementation(async () => {
        // mark rendered so the action stops (mirrors real behaviour)
        Object.defineProperty(controller, 'rendered', { get: () => true, configurable: true });
    });
    controller.renderErrors = jest.fn().mockImplementation(async () => {
        Object.defineProperty(controller, 'rendered', { get: () => true, configurable: true });
    });

    // Stub authorize: allow everything by default; individual tests override it
    controller.authorize = jest.fn().mockResolvedValue(undefined);

    return controller;
}


// ---------------------------------------------------------------------------
// Helpers: build lightweight user / mat / matCode objects
// ---------------------------------------------------------------------------
let _nextId = 1;
function nextId() { return _nextId++; }

function makeUser(overrides = {}) {
    const id = nextId();
    return {
        id,
        name:      `user-${id}`,
        api_token: `token-${id}`,
        ...overrides,
    };
}

function makeMatCode(role) {
    return { role };
}

function makeMat(creatorId, judgeCount = 3) {
    let judges  = [];
    let viewers = [];

    return {
        id:         nextId(),
        creator_id: creatorId,
        judge_count: judgeCount,

        getJudges:  jest.fn(async (opts) => {
            if (opts && opts.where && opts.where.id !== undefined) {
                return judges.filter(u => u.id == opts.where.id);
            }
            return [...judges];
        }),
        getViewers: jest.fn(async (opts) => {
            if (opts && opts.where && opts.where.id !== undefined) {
                return viewers.filter(u => u.id == opts.where.id);
            }
            return [...viewers];
        }),
        addJudge:    jest.fn(async (user) => { judges.push(user);                              }),
        removeJudge: jest.fn(async (user) => { judges  = judges.filter(u => u.id !== user.id); }),
        addViewer:    jest.fn(async (user) => { viewers.push(user);                              }),
        removeViewer: jest.fn(async (user) => { viewers = viewers.filter(u => u.id !== user.id); }),
    };
}


// ---------------------------------------------------------------------------
// Reset call counts between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
    jest.clearAllMocks();
});


// ===========================================================================
// 1. creator joins with admin code → stored as viewer, not judge
// ===========================================================================
describe('postJoin: creator with admin code is stored as viewer, not judge', () => {
    it('does NOT add the creator to judges and DOES add them to viewers', async () => {
        const userA   = makeUser();
        const mat     = makeMat(userA.id);
        const matCode = makeMatCode(MatCode.ROLES.ADMIN);

        const controller = makeController({ mat, matCode, user: userA });
        await controller.postJoin();

        expect(mat.addJudge).not.toHaveBeenCalled();
        expect(mat.addViewer).toHaveBeenCalledWith(userA);

        const judges  = await mat.getJudges();
        const viewers = await mat.getViewers();
        expect(judges.some(j => j.id === userA.id)).toBe(false);
        expect(viewers.some(v => v.id === userA.id)).toBe(true);
    });
});


// ===========================================================================
// 2. creator join does not consume a judge slot
// ===========================================================================
describe('postJoin: creator join does not consume a judge slot', () => {
    it('allows judge_count judges to join after the creator has joined', async () => {
        const userA = makeUser(); // creator
        const userB = makeUser();
        const userC = makeUser();
        const userD = makeUser();

        // judge_count = 2 → only 2 judge slots available
        const mat         = makeMat(userA.id, 2);
        const adminCode   = makeMatCode(MatCode.ROLES.ADMIN);

        // --- userA (creator) joins with admin code → goes to viewers ---
        const ctrlA = makeController({ mat, matCode: adminCode, user: userA });
        await ctrlA.postJoin();
        expect(mat.addJudge).not.toHaveBeenCalled();
        expect(mat.addViewer).toHaveBeenCalledTimes(1);

        // --- userB joins → judge slot 1 ---
        const ctrlB = makeController({ mat, matCode: adminCode, user: userB });
        await ctrlB.postJoin();
        expect(mat.addJudge).toHaveBeenCalledWith(userB);

        // --- userC joins → judge slot 2 ---
        const ctrlC = makeController({ mat, matCode: adminCode, user: userC });
        await ctrlC.postJoin();
        expect(mat.addJudge).toHaveBeenCalledWith(userC);

        // --- userD joins → should fail: max judge count reached ---
        const ctrlD = makeController({ mat, matCode: adminCode, user: userD });
        await ctrlD.postJoin();
        expect(ctrlD.renderErrors).toHaveBeenCalledWith(
            expect.objectContaining({ matCode: expect.arrayContaining(['maximum judge count reached']) })
        );
        // userD must NOT have been added as a judge
        const judges = await mat.getJudges();
        expect(judges.some(j => j.id === userD.id)).toBe(false);
    });
});


// ===========================================================================
// 3. non-creator admin code join is stored as judge
// ===========================================================================
describe('postJoin: non-creator with admin code is stored as judge', () => {
    it('adds a non-creator user to judges when they use an admin code', async () => {
        const creator = makeUser();
        const userB   = makeUser();
        const mat     = makeMat(creator.id);
        const matCode = makeMatCode(MatCode.ROLES.ADMIN);

        const controller = makeController({ mat, matCode, user: userB });
        await controller.postJoin();

        expect(mat.addJudge).toHaveBeenCalledWith(userB);
        expect(mat.addViewer).not.toHaveBeenCalled();

        const judges = await mat.getJudges();
        expect(judges.some(j => j.id === userB.id)).toBe(true);
    });
});


// ===========================================================================
// 4. creator deleteJoin removes viewer record
// ===========================================================================
describe('deleteJoin: creator is removed from viewers', () => {
    it('removes the creator from viewers and does not throw', async () => {
        const userA   = makeUser();
        const mat     = makeMat(userA.id);
        const matCode = makeMatCode(MatCode.ROLES.ADMIN);

        // First, add the creator as a viewer (simulates having already joined)
        await mat.addViewer(userA);
        expect((await mat.getViewers()).some(v => v.id === userA.id)).toBe(true);

        const controller = makeController({ mat, matCode, user: userA });
        await expect(controller.deleteJoin()).resolves.not.toThrow();

        expect(mat.removeViewer).toHaveBeenCalledWith(userA);

        const viewers = await mat.getViewers();
        expect(viewers.some(v => v.id === userA.id)).toBe(false);
    });
});


// ===========================================================================
// 5. regular judge deleteJoin removes judge record
// ===========================================================================
describe('deleteJoin: non-creator judge is removed from judges', () => {
    it('removes a judge from the judges list and does not throw', async () => {
        const creator = makeUser();
        const userB   = makeUser();
        const mat     = makeMat(creator.id);
        const matCode = makeMatCode(MatCode.ROLES.ADMIN);

        // Add userB as a judge to simulate having already joined
        await mat.addJudge(userB);
        expect((await mat.getJudges()).some(j => j.id === userB.id)).toBe(true);

        const controller = makeController({ mat, matCode, user: userB });
        await expect(controller.deleteJoin()).resolves.not.toThrow();

        expect(mat.removeJudge).toHaveBeenCalledWith(userB);

        const judges = await mat.getJudges();
        expect(judges.some(j => j.id === userB.id)).toBe(false);
    });
});


// ===========================================================================
// 6. join response: creator joining with admin code → role is "viewer"
// ===========================================================================
describe('postJoin response: role field', () => {
    it('responds with role "viewer" when the creator joins with an admin code', async () => {
        const userA   = makeUser();
        const mat     = makeMat(userA.id);
        const matCode = makeMatCode(MatCode.ROLES.ADMIN);

        // Capture the actual payload passed to render
        let capturedPayload;
        const controller = makeController({ mat, matCode, user: userA });
        controller.render = jest.fn().mockImplementation(async (payload) => {
            capturedPayload = payload;
            Object.defineProperty(controller, 'rendered', { get: () => true, configurable: true });
        });

        await controller.postJoin();

        expect(capturedPayload).toBeDefined();
        expect(capturedPayload.role).toBe('viewer');
    });
});


// ===========================================================================
// 7. join response: non-creator admin code → "admin"; viewer code → "viewer"
// ===========================================================================
describe('postJoin response: role field for non-creator', () => {
    it('responds with role "admin" when a non-creator joins with an admin code', async () => {
        const creator = makeUser();
        const userB   = makeUser();
        const mat     = makeMat(creator.id);
        const matCode = makeMatCode(MatCode.ROLES.ADMIN);

        let capturedPayload;
        const controller = makeController({ mat, matCode, user: userB });
        controller.render = jest.fn().mockImplementation(async (payload) => {
            capturedPayload = payload;
            Object.defineProperty(controller, 'rendered', { get: () => true, configurable: true });
        });

        await controller.postJoin();

        expect(capturedPayload).toBeDefined();
        expect(capturedPayload.role).toBe('admin');
    });

    it('responds with role "viewer" when a user joins with a viewer code', async () => {
        const creator   = makeUser();
        const userB     = makeUser();
        const mat       = makeMat(creator.id);
        const viewerCode = makeMatCode(MatCode.ROLES.VIEWER);

        let capturedPayload;
        const controller = makeController({ mat, matCode: viewerCode, user: userB });
        controller.render = jest.fn().mockImplementation(async (payload) => {
            capturedPayload = payload;
            Object.defineProperty(controller, 'rendered', { get: () => true, configurable: true });
        });

        await controller.postJoin();

        expect(capturedPayload).toBeDefined();
        expect(capturedPayload.role).toBe('viewer');
    });
});
