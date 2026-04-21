/**
 * Tests for mat/UsersController — judge join/leave mid-match behaviour.
 *
 * All DB/ORM interactions are mocked so no live database is needed.
 *
 * Scenarios:
 *   A — judge joins a running consensus match (≥2 existing judges)
 *   B — judge blocked from joining a solo (1-judge) match in progress
 *   C — judge leaves a running match (open vote is auto-ended, removed from judges_matches)
 */

// ---------------------------------------------------------------------------
// Silence logger noise in test output
// ---------------------------------------------------------------------------
jest.mock('../../../lib/logger', () => ({
    logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));


// ---------------------------------------------------------------------------
// Mock BaseRecord so model constructors work without a real DB
// ---------------------------------------------------------------------------
jest.mock('../../../lib/activeRecord', () => {
    class BaseRecord {
        #cachedAssociations = {};

        constructor(attrs = {}) {
            Object.assign(this, attrs);
        }

        static initialize() {}
        static belongsTo()  {}
        static hasMany()    {}
        static belongsToMany() {}
        static hasOne()     {}
        static addHook()    {}
        static transaction(fn) { return fn(); }
        static get fn()    { return null; }
        static get col()   { return null; }

        async save() { return this; }

        async getCachedAssociation(name, Cls, where) {
            if (!this.#cachedAssociations[name]) {
                const record = await Cls.findAll({ where });
                this._cacheRecord(name, record);
            }
            return Array.from(this.#cachedAssociations[name]);
        }

        clearCachedAssociation(name) {
            delete this.#cachedAssociations[name];
        }

        _cacheRecord(name, val) {
            this.#cachedAssociations[name] = val;
        }
    }
    return { BaseRecord };
});


// ---------------------------------------------------------------------------
// Pull in real modules under test (they'll use the mocked BaseRecord above)
// ---------------------------------------------------------------------------
const { UsersController } = require('../../../controllers/mat/usersController');
const { MatCode }         = require('../../../models/matCode');
const { calculateRidingTime } = require('../../../lib/ridingTime');


// ---------------------------------------------------------------------------
// Minimal request / response factory (mirrors jest-express shape)
// ---------------------------------------------------------------------------
function makeRequest({ headers = {}, params = {}, body = {}, query = {} } = {}) {
    return { headers, params, body, query };
}

function makeResponse() {
    const res = { statusCode: 200, headers: {} };
    res.json = jest.fn(body => { res._body = body; });
    res.set  = jest.fn();
    res.send = jest.fn();
    return res;
}


// ---------------------------------------------------------------------------
// Helper: build a UsersController with pre-set state bypassing HTTP callbacks
// ---------------------------------------------------------------------------
function makeController({ user, mat, matCode, match } = {}) {
    const req = makeRequest();
    const res = makeResponse();
    const ctrl = new UsersController(req, res);

    // Inject state directly (mirrors how setupRequestState would populate them)
    if (user)    ctrl.currentUser    = user;
    if (mat)     ctrl['_ServerController__currentMat']     = mat;
    if (matCode) ctrl['_ServerController__currentMatCode'] = matCode;
    if (match)   ctrl['_ServerController__currentMatch']   = match;

    return { ctrl, res };
}


// ---------------------------------------------------------------------------
// Object builders
// ---------------------------------------------------------------------------
let _id = 0;
const uid = () => `id-${++_id}`;

function makeUser(attrs = {}) {
    return { id: uid(), api_token: uid(), ...attrs };
}

function makeMat(attrs = {}) {
    return {
        id: uid(),
        _judges:  [],
        _viewers: [],
        _matches: [],
        getJudges:          jest.fn(async function() { return [...this._judges]; }),
        addJudge:           jest.fn(async function(u) { this._judges.push(u); }),
        removeJudge:        jest.fn(async function(u) { this._judges = this._judges.filter(j => j.id !== u.id); }),
        addViewer:          jest.fn(),
        removeViewer:       jest.fn(),
        getViewers:         jest.fn(async () => []),
        getIncompleteMatches: jest.fn(async function() { return [...this._matches]; }),
        ...attrs,
    };
}

function makeMatch(attrs = {}) {
    return {
        id:      uid(),
        started: true,
        started_at: new Date(),
        ended_at:   null,
        ended:   false,
        _judges: [],
        getJudges:   jest.fn(async function() { return [...this._judges]; }),
        addJudge:    jest.fn(async function(u) { this._judges.push(u); }),
        removeJudge: jest.fn(async function(u) { this._judges = this._judges.filter(j => j.id !== u.id); }),
        getRounds:   jest.fn(async () => []),
        ...attrs,
    };
}

function makeMatCode(role = MatCode.ROLES.ADMIN, attrs = {}) {
    return { id: uid(), role, getMat: jest.fn(), ...attrs };
}

function makeActiveVote(attrs = {}) {
    return {
        id:       uid(),
        ended_at: null,
        end:      jest.fn(async function() { this.ended_at = new Date(); }),
        get ended() { return Boolean(this.ended_at); },
        ...attrs,
    };
}

function makeOpenRound(attrs = {}) {
    return {
        id:      uid(),
        ended:   false,
        started: true,
        currentRidingTimeVoteForJudge: jest.fn(async () => null),
        ...attrs,
    };
}


// ---------------------------------------------------------------------------
// Inject private fields via the public setter pattern the controller exposes
// (currentUser has a setter; mat/matCode/match we patch via prototype chain)
// ---------------------------------------------------------------------------
function injectMat(ctrl, mat) {
    // ServerController stores mat in a private field; expose it via the getter
    // by overriding the getter on the instance using Object.defineProperty.
    Object.defineProperty(ctrl, 'currentMat', { get: () => mat, configurable: true });
}

function injectMatCode(ctrl, matCode) {
    Object.defineProperty(ctrl, 'currentMatCode', { get: () => matCode, configurable: true });
}

function injectMatch(ctrl, match) {
    Object.defineProperty(ctrl, 'currentMatch', { get: () => match, configurable: true });
}

function injectAuthorizer(ctrl) {
    // Stub authorize so it always resolves (permissions are not under test here)
    ctrl.authorize = jest.fn().mockResolvedValue(undefined);
}


// ---------------------------------------------------------------------------
// Scenario A — judge joins a running consensus match (≥2 existing judges)
// ---------------------------------------------------------------------------
describe('Scenario A: judge joins a running consensus match', () => {
    let judge1, judge2, judge3, mat, match, matCode, ctrl, res;

    beforeEach(() => {
        judge1 = makeUser();
        judge2 = makeUser();
        judge3 = makeUser();  // the newcomer

        match = makeMatch();
        match._judges = [judge1, judge2];

        mat = makeMat();
        mat._judges  = [judge1, judge2];
        mat._matches = [match];

        matCode = makeMatCode(MatCode.ROLES.ADMIN);

        const req = makeRequest();
        res       = makeResponse();
        ctrl      = new UsersController(req, res);

        ctrl.currentUser = judge3;
        injectMat(ctrl, mat);
        injectMatCode(ctrl, matCode);
        injectAuthorizer(ctrl);
    });

    it('adds the new judge to the mat', async () => {
        await ctrl.addAsJudge();
        expect(mat.addJudge).toHaveBeenCalledWith(judge3);
    });

    it('adds the new judge to the active match judges_matches', async () => {
        await ctrl.addAsJudge();
        expect(match.addJudge).toHaveBeenCalledWith(judge3);
    });

    it('does not render an error', async () => {
        await ctrl.addAsJudge();
        // rendered flag stays false because addAsJudge only renders on errors
        expect(ctrl.rendered).toBe(false);
    });

    it('the match now has 3 judges', async () => {
        await ctrl.addAsJudge();
        const judges = await match.getJudges();
        expect(judges).toHaveLength(3);
    });

    it('threshold is still 2 for a 3-judge panel (calculateRidingTime)', () => {
        // Verify the ridingTime module honours the new threshold formula:
        // judges.length === 1 ? 1 : 2
        const j1 = { id: 'a-j1' };
        const j2 = { id: 'a-j2' };
        const j3 = { id: 'a-j3' };

        // Only j1 votes — below threshold of 2 → no periods
        const onlyOne = [
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,10), judge_id: j1.id }
        ];
        const periods1 = calculateRidingTime(onlyOne, [j1, j2, j3], new Date(2026,0,1,10,0,10));
        expect(periods1).toEqual([]);

        // j1 and j2 vote together — meets threshold of 2 → one 5s period
        const twoVotes = [
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,5), judge_id: j1.id },
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,5), judge_id: j2.id },
        ];
        const periods2 = calculateRidingTime(twoVotes, [j1, j2, j3], new Date(2026,0,1,10,0,5));
        expect(periods2).toEqual([5]);
    });
});


// ---------------------------------------------------------------------------
// Scenario B — judge blocked from joining a solo (1-judge) match in progress
// ---------------------------------------------------------------------------
describe('Scenario B: judge blocked from joining a solo match in progress', () => {
    let judge1, judge2, mat, match, matCode, ctrl, res;

    beforeEach(() => {
        judge1 = makeUser();
        judge2 = makeUser();  // the blocked newcomer

        match = makeMatch();
        match._judges = [judge1];  // only 1 judge → solo match

        mat = makeMat();
        mat._judges  = [judge1];
        mat._matches = [match];

        matCode = makeMatCode(MatCode.ROLES.ADMIN);

        const req = makeRequest();
        res       = makeResponse();
        ctrl      = new UsersController(req, res);

        ctrl.currentUser = judge2;
        injectMat(ctrl, mat);
        injectMatCode(ctrl, matCode);
        injectAuthorizer(ctrl);
    });

    it('renders an error containing "cannot join a solo match in progress"', async () => {
        await ctrl.addAsJudge();
        expect(ctrl.rendered).toBe(true);
        const body = res.json.mock.calls[0][0];
        expect(JSON.stringify(body)).toContain('cannot join a solo match in progress');
    });

    it('does NOT call addJudge on the active match', async () => {
        await ctrl.addAsJudge();
        expect(match.addJudge).not.toHaveBeenCalled();
    });

    it('the match still has exactly 1 judge in judges_matches', async () => {
        await ctrl.addAsJudge();
        const judges = await match.getJudges();
        expect(judges).toHaveLength(1);
    });

    it('adds the judge to the mat even when blocked from the match', async () => {
        // The mat.addJudge is called before the match check
        await ctrl.addAsJudge();
        expect(mat.addJudge).toHaveBeenCalledWith(judge2);
    });

    it('sets status code to 400 for the error response', async () => {
        await ctrl.addAsJudge();
        expect(res.statusCode).toBe(400);
    });
});


// ---------------------------------------------------------------------------
// Scenario C — judge leaves a running match
// ---------------------------------------------------------------------------
describe('Scenario C: judge leaves a running match', () => {
    let judgeA, judgeB, judgeC, activeVote, openRound, match, mat, matCode, ctrl, res;

    beforeEach(() => {
        judgeA = makeUser();
        judgeB = makeUser();
        judgeC = makeUser();

        activeVote = makeActiveVote();

        openRound = makeOpenRound({
            currentRidingTimeVoteForJudge: jest.fn(async (u) => {
                if (u.id === judgeA.id) return activeVote;
                return null;
            })
        });

        match = makeMatch();
        match._judges = [judgeA, judgeB, judgeC];
        match.getRounds = jest.fn(async () => [openRound]);

        mat = makeMat();
        mat._judges  = [judgeA, judgeB, judgeC];
        mat._matches = [match];

        matCode = makeMatCode(MatCode.ROLES.ADMIN);

        const req = makeRequest();
        res       = makeResponse();
        ctrl      = new UsersController(req, res);

        ctrl.currentUser = judgeA;
        injectMat(ctrl, mat);
        injectMatCode(ctrl, matCode);
        injectAuthorizer(ctrl);
    });

    it('removes the judge from judges_matches', async () => {
        await ctrl.removeUser(MatCode.ROLES.ADMIN);
        expect(match.removeJudge).toHaveBeenCalledWith(judgeA);
    });

    it('removes the judge from the mat', async () => {
        await ctrl.removeUser(MatCode.ROLES.ADMIN);
        expect(mat.removeJudge).toHaveBeenCalledWith(judgeA);
    });

    it("auto-ends judge A's open riding time vote", async () => {
        await ctrl.removeUser(MatCode.ROLES.ADMIN);
        expect(activeVote.end).toHaveBeenCalledTimes(1);
        expect(activeVote.ended_at).not.toBeNull();
    });

    it('does not end the vote of a judge who is not leaving', async () => {
        // judgeB has no open vote; the mock returns null for non-judgeA
        await ctrl.removeUser(MatCode.ROLES.ADMIN);
        // activeVote.end should only have been called once (for judgeA)
        expect(activeVote.end).toHaveBeenCalledTimes(1);
    });

    it('ends the vote before removing the judge from the match', async () => {
        const callOrder = [];
        activeVote.end = jest.fn(async () => { callOrder.push('vote.end'); });
        match.removeJudge = jest.fn(async () => { callOrder.push('match.removeJudge'); });

        await ctrl.removeUser(MatCode.ROLES.ADMIN);

        expect(callOrder.indexOf('vote.end')).toBeLessThan(callOrder.indexOf('match.removeJudge'));
    });
});


// ---------------------------------------------------------------------------
// Threshold formula — direct unit tests for calculateRidingTime
// ---------------------------------------------------------------------------
describe('calculateRidingTime threshold: judges.length === 1 ? 1 : 2', () => {
    it('single judge (threshold=1): sole vote earns full time', () => {
        const j = { id: 'thresh-j1' };
        const votes = [
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,9), judge_id: j.id }
        ];
        const periods = calculateRidingTime(votes, [j], new Date(2026,0,1,10,0,9));
        expect(periods).toEqual([9]);
    });

    it('two judges (threshold=2): only one judge active → no quorum, no time', () => {
        const j1 = { id: 'thresh-j2a' };
        const j2 = { id: 'thresh-j2b' };
        const votes = [
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,9), judge_id: j1.id }
        ];
        const periods = calculateRidingTime(votes, [j1, j2], new Date(2026,0,1,10,0,9));
        expect(periods).toEqual([]);
    });

    it('two judges (threshold=2): both active → quorum met, time counts', () => {
        const j1 = { id: 'thresh-j3a' };
        const j2 = { id: 'thresh-j3b' };
        const votes = [
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,6), judge_id: j1.id },
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,6), judge_id: j2.id },
        ];
        const periods = calculateRidingTime(votes, [j1, j2], new Date(2026,0,1,10,0,6));
        expect(periods).toEqual([6]);
    });

    it('five judges (threshold=2, not 3): two votes meet quorum', () => {
        const judges = [1,2,3,4,5].map(n => ({ id: `thresh-5j-${n}` }));
        const votes = [
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,6), judge_id: judges[0].id },
            { started_at: new Date(2026,0,1,10,0,0), ended_at: new Date(2026,0,1,10,0,6), judge_id: judges[1].id },
        ];
        const periods = calculateRidingTime(votes, judges, new Date(2026,0,1,10,0,6));
        // Under old formula max(ceil(5/2),2)=3, two votes would NOT meet quorum.
        // Under new formula threshold=2, two votes DO meet quorum.
        expect(periods).toEqual([6]);
    });
});
