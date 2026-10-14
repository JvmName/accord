const { afterAll, beforeAll, describe, expect, it, setSystemTime } = require('bun:test');
/**
 * PARITY: lifecycle services (src/services, task 10b) vs the legacy model
 * methods they port, on two separate, identically seeded scratch DBs.
 * See ./support.js for what is compared and why (tables + write-order audit
 * log + outcome, with a frozen clock).
 *
 * Every scenario calls the legacy side the way its real caller does (a route:
 * `Match.find` then the model method; a worker: the REAL worker class's
 * `performJob()`, restricted to the scenario's round/match), and the modern
 * side the way task 13b/14 will (repository read, then the service).
 */
const Http = require('../helpers/httpServer');

// Must happen before any model module opens a connection.
const previousDatabasePath = process.env.DATABASE_PATH;
const file = Http.useTemporaryDatabase('accord-lifecycle-parity');

const H = require('./support');
const Matches   = require('../../src/db/repositories/matches');
const Rounds    = require('../../src/db/repositories/rounds');
const Votes     = require('../../src/db/repositories/votes');
const MatchSvc  = require('../../src/services/matchLifecycle');
const RoundSvc  = require('../../src/services/roundLifecycle');
const VoteSvc   = require('../../src/services/ridingTimeVotes');

let L;        // legacy models + workers
let IDS;
let T0;
let NOW;
let legacyDb; // raw bun:sqlite handle on the legacy file
let db;       // Drizzle-baseline DB
let snap;

const at  = (s) => T0 + s * 1000;
const iso = (s) => new Date(at(s)).toISOString();
const X   = (suffix) => `00000000-0000-4000-9000-${suffix.padStart(12, '0')}`;
const stamps = (s) => ({ created_at: iso(s), updated_at: iso(s) });

beforeAll(async () => {
    await Http.migrate();
    const seedModule = require('../contract/seed.ts');
    IDS = seedModule.IDS;
    T0  = seedModule.T0;
    NOW = seedModule.NOW;
    await seedModule.seed({ set: (ms) => setSystemTime(new Date(ms)) });
    setSystemTime();
    L = {
        Match: require('../../models/match').Match,
        Round: require('../../models/round').Round,
        User:  require('../../models/user').User,
        TechFallTrackerWorker: require('../../lib/workerQueue/techFallTrackerWorker').TechFallTrackerWorker,
        RoundTimerWorker:      require('../../lib/workerQueue/roundTimerWorker').RoundTimerWorker,
        BreakTransitionWorker: require('../../lib/workerQueue/breakTransitionWorker').BreakTransitionWorker,
    };
    legacyDb = H.legacyClient(file);
    snap = H.snapshot(legacyDb);
    db = H.modernDb();
}, 30000);

afterAll(() => {
    setSystemTime();
    if (legacyDb) legacyDb.close();
    if (db) db.$client.close();
    if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
});


/* ---------------------------------------------------------------------------
 * Harness
 * ------------------------------------------------------------------------- */

function resetBoth(setup) {
    H.restore(legacyDb, snap);
    H.restore(db.$client, snap);
    if (setup) {
        setup((table, rows) => {
            H.insertRaw(legacyDb, table, rows);
            H.insertRaw(db.$client, table, rows);
        });
    }
}

/**
 * Run `legacy()` on the legacy DB and `modern()` on the Drizzle DB at the same
 * frozen instant, then require identical outcome, tables and write log.
 * Returns the (normalised) legacy state for scenario-specific assertions.
 */
async function parity({ setup, at: when, legacy, modern }) {
    resetBoth(setup);
    const known = H.idsIn(legacyDb);
    setSystemTime(new Date(when ?? NOW));
    let legacyOutcome;
    let modernOutcome;
    try {
        legacyOutcome = await H.settle(legacy);
        modernOutcome = await H.settle(modern);
    } finally {
        setSystemTime();
    }
    const legacyState = H.normalize(H.dump(legacyDb), known);
    const modernState = H.normalize(H.dump(db.$client), known);
    expect(modernOutcome).toEqual(legacyOutcome);
    if (legacyOutcome.ok) expect(modernOutcome.value).toBe(legacyOutcome.value); // strict: both undefined
    expect(modernState.audit).toEqual(legacyState.audit);
    expect(modernState.tables).toEqual(legacyState.tables);
    return { outcome: legacyOutcome, state: legacyState };
}

const rowOf   = (state, table, id) => state.tables[table].find((r) => r.id === id);
const rowsOf  = (state, table, pred) => state.tables[table].filter(pred);
const writes  = (state) => state.audit.map((e) => `${e.op} ${e.tbl}`);
const fails   = (message) => ({ ok: false, error: 'Error', message });

/* Legacy, route-style (ServerController loads `currentMatch` with Match.find). */
const legacyMatch     = (key) => L.Match.find(IDS[key] ?? key);
const legacyLastRound = async (key) => (await legacyMatch(key)).getLastRound();
/* Modern, route-style. */
const modernMatch     = (key) => Matches.findMatchById(db, IDS[key] ?? key);
const modernLastRound = (key) => Rounds.findLastRound(db, IDS[key] ?? key);

/** Run a REAL legacy worker's performJob(), restricted to some rounds / matches. */
async function runLegacyWorker(Cls, { roundIds, matchIds }) {
    const worker = new Cls('parity-worker');
    worker.notifyServer = () => {};
    const origOpen  = L.Round.getOpenRounds;
    const origWhere = L.Match.where;
    if (roundIds) L.Round.getOpenRounds = async function () { return (await origOpen.call(this)).filter((r) => roundIds.includes(r.id)); };
    if (matchIds) L.Match.where = async function (...args) { return (await origWhere.apply(this, args)).filter((m) => matchIds.includes(m.id)); };
    try {
        await worker.performJob();
    } finally {
        L.Round.getOpenRounds = origOpen;
        L.Match.where = origWhere;
    }
}


/* ---------------------------------------------------------------------------
 * Custom fixtures (written identically into both DBs)
 * ------------------------------------------------------------------------- */

const C = {
    match:      X('100'),
    r1:         X('101'),
    r2:         X('102'),
    r3:         X('103'),
    v1:         X('111'),
    v2:         X('112'),
    v3:         X('113'),
    v0:         X('110'),
    p1:         X('121'),
    p2:         X('122'),
    ghostUser:  X('dead'),
};

function addMatch(add, { matId = IDS['mat:flow'], red = IDS['user:red'], blue = IDS['user:blue'], startedAt = 100, endedAt = null, breakStartedAt = null, breakDuration = null, judges = [IDS['user:judgeA'], IDS['user:judgeB']] } = {}) {
    add('matches', [{
        id: C.match, creator_id: IDS['user:creator'], mat_id: matId,
        red_competitor_id: red, blue_competitor_id: blue, red_score: 0, blue_score: 0,
        started_at: startedAt == null ? null : iso(startedAt), ended_at: endedAt == null ? null : iso(endedAt),
        break_started_at: breakStartedAt == null ? null : iso(breakStartedAt), break_duration: breakDuration,
        ...stamps(90),
    }]);
    if (judges.length) add('judges_matches', judges.map((user_id) => ({ match_id: C.match, user_id, ...stamps(95) })));
}

function addRound(add, id, { start, end = null, winner = null, stoppage = null }) {
    add('rounds', [{ id, match_id: C.match, ended_at: end == null ? null : iso(end), ...stamps(start), declared_winner_id: winner, stoppage }]);
}

function addVote(add, id, { round, judge, competitor, start, end = null }) {
    add('riding_time_votes', [{ id, round_id: round, judge_id: judge, competitor_id: competitor, ended_at: end == null ? null : iso(end), ...stamps(start) }]);
}

/**
 * Rounds 1-2 ended, round 3 OPEN with open consensus votes for red and (unless
 * `pause: false`) an open pause. Without the pause, round 3 (60 s) has expired by NOW.
 */
function finalRoundFixture(add, matchOpts = {}, { pause = true } = {}) {
    addMatch(add, matchOpts);
    addRound(add, C.r1, { start: 100, end: 200 });
    addRound(add, C.r2, { start: 270, end: 390 });
    addRound(add, C.r3, { start: 450 });
    addVote(add, C.v1, { round: C.r3, judge: IDS['user:judgeA'], competitor: IDS['user:red'], start: 460 });
    addVote(add, C.v2, { round: C.r3, judge: IDS['user:judgeB'], competitor: IDS['user:red'], start: 461 });
    if (pause) add('round_pauses', [{ id: C.p1, round_id: C.r3, paused_at: iso(500), resumed_at: null, ...stamps(500) }]);
}

/** Red already won round 1 (submission); round 2 OPEN with red consensus control => red's 2nd win on end. */
function twoWinsFixture(add) {
    addMatch(add);
    addRound(add, C.r1, { start: 100, end: 200, winner: IDS['user:red'], stoppage: 0 });
    addRound(add, C.r2, { start: 300 });
    addVote(add, C.v1, { round: C.r2, judge: IDS['user:judgeA'], competitor: IDS['user:red'], start: 310 });
    addVote(add, C.v2, { round: C.r2, judge: IDS['user:judgeB'], competitor: IDS['user:red'], start: 310 });
}


/* ---------------------------------------------------------------------------
 * Scenarios
 * ------------------------------------------------------------------------- */

describe('PARITY harness sanity', () => {
    it('both DBs start from the same non-trivial snapshot, and the audit triggers record writes', async () => {
        resetBoth();
        expect(H.dump(db.$client)).toEqual(H.dump(legacyDb));
        expect(snap.matches.length).toBeGreaterThanOrEqual(20);
        expect(snap.rounds.length).toBeGreaterThanOrEqual(15);
        expect(snap.riding_time_votes.length).toBeGreaterThan(0);
        expect(snap.round_pauses.length).toBeGreaterThan(0);
        // the two DBs really are different databases with different provenance
        expect(legacyDb.query("SELECT count(*) AS n FROM sqlite_master WHERE name = 'migration_versions'").get().n).toBe(1);
        expect(db.$client.query("SELECT count(*) AS n FROM sqlite_master WHERE name = 'migration_versions'").get().n).toBe(0);
        const { state } = await parity({
            legacy: async () => { await (await legacyMatch('match:toStart')).start(); },
            modern: async () => { await MatchSvc.startMatch(db, await modernMatch('match:toStart')); },
        });
        expect(state.audit.length).toBeGreaterThan(0);
    });
});


describe('PARITY: startMatch == Match#start', () => {
    it('unstarted match: started_at, mat judges copied, round 1 started', async () => {
        const { state, outcome } = await parity({
            legacy: async () => { await (await legacyMatch('match:toStart')).start(); },
            modern: async () => { await MatchSvc.startMatch(db, await modernMatch('match:toStart')); },
        });
        expect(outcome).toEqual({ ok: true, value: undefined });
        expect(rowOf(state, 'matches', IDS['match:toStart']).started_at).toBe(new Date(NOW).toISOString());
        expect(rowsOf(state, 'judges_matches', (j) => j.match_id === IDS['match:toStart']).map((j) => j.user_id))
            .toEqual([IDS['user:judgeA'], IDS['user:judgeB']]);
        expect(rowsOf(state, 'rounds', (r) => r.match_id === IDS['match:toStart'])).toHaveLength(1);
        expect(writes(state)).toEqual(['UPDATE matches', 'INSERT judges_matches', 'INSERT judges_matches', 'INSERT rounds']);
    });

    it('already started: throws "This match has already started", writes nothing', async () => {
        const { state, outcome } = await parity({
            legacy: async () => { await (await legacyMatch('match:open')).start(); },
            modern: async () => { await MatchSvc.startMatch(db, await modernMatch('match:open')); },
        });
        expect(outcome).toEqual(fails('This match has already started'));
        expect(state.audit).toEqual([]);
    });

    it('setJudges semantics: drops judges not on the mat, keeps existing rows untouched, adds the rest', async () => {
        const { state } = await parity({
            setup: (add) => addMatch(add, { startedAt: null, judges: [IDS['user:outsider'], IDS['user:judgeA']] }),
            legacy: async () => { await (await legacyMatch(C.match)).start(); },
            modern: async () => { await MatchSvc.startMatch(db, await modernMatch(C.match)); },
        });
        const judges = rowsOf(state, 'judges_matches', (j) => j.match_id === C.match);
        expect(judges.map((j) => j.user_id).sort()).toEqual([IDS['user:judgeA'], IDS['user:judgeB']].sort());
        expect(judges.find((j) => j.user_id === IDS['user:judgeA']).created_at).toBe(iso(95)); // untouched
        expect(writes(state)).toEqual(['UPDATE matches', 'DELETE judges_matches', 'INSERT judges_matches', 'INSERT rounds']);
    });

    it('mat with no judges: every match judge row is removed', async () => {
        const { state } = await parity({
            setup: (add) => addMatch(add, { matId: IDS['mat:empty'], startedAt: null, judges: [IDS['user:judgeA']] }),
            legacy: async () => { await (await legacyMatch(C.match)).start(); },
            modern: async () => { await MatchSvc.startMatch(db, await modernMatch(C.match)); },
        });
        expect(rowsOf(state, 'judges_matches', (j) => j.match_id === C.match)).toEqual([]);
    });

    it('NOT atomic (F-50): an open round makes startRound throw AFTER started_at and judges were written', async () => {
        const { state, outcome } = await parity({
            setup: (add) => { addMatch(add, { startedAt: null, judges: [] }); addRound(add, C.r1, { start: 95 }); },
            legacy: async () => { await (await legacyMatch(C.match)).start(); },
            modern: async () => { await MatchSvc.startMatch(db, await modernMatch(C.match)); },
        });
        expect(outcome).toEqual(fails('Cannot start a new round while there is an active round'));
        expect(rowOf(state, 'matches', C.match).started_at).not.toBeNull();
        expect(writes(state)).toEqual(['UPDATE matches', 'INSERT judges_matches', 'INSERT judges_matches']);
    });
});


describe('PARITY: endMatch == Match#end (route: POST /match/:id/end)', () => {
    it('active round 1: match ended, round ended, and the break RE-SET on the ended match (F-25.3)', async () => {
        const { state } = await parity({
            legacy: async () => { await (await legacyMatch('match:toEnd')).end(); },
            modern: async () => { await MatchSvc.endMatch(db, await modernMatch('match:toEnd')); },
        });
        const m = rowOf(state, 'matches', IDS['match:toEnd']);
        expect(m.ended_at).not.toBeNull();
        expect(m.break_started_at).not.toBeNull();
        expect(m.break_duration).toBe(60);
        expect(rowOf(state, 'rounds', IDS['round:toEnd']).ended_at).not.toBeNull();
        expect(writes(state)).toEqual(['UPDATE matches', 'UPDATE rounds', 'UPDATE matches']);
    });

    it('active FINAL round: votes closed, pause resumed, round ended, then re-entrant end throws "This match has already ended" (F-54)', async () => {
        const { state, outcome } = await parity({
            setup: (add) => finalRoundFixture(add),
            legacy: async () => { await (await legacyMatch(C.match)).end(); },
            modern: async () => { await MatchSvc.endMatch(db, await modernMatch(C.match)); },
        });
        expect(outcome).toEqual(fails('This match has already ended'));
        expect(writes(state)).toEqual(['UPDATE matches', 'UPDATE riding_time_votes', 'UPDATE riding_time_votes', 'UPDATE round_pauses', 'UPDATE rounds']);
        expect(rowOf(state, 'matches', C.match).ended_at).not.toBeNull();
    });

    it('in a break with the last round ended: break cleared, endRound({safe:true}) returns silently', async () => {
        const { state, outcome } = await parity({
            legacy: async () => { await (await legacyMatch('match:break')).end(); },
            modern: async () => { await MatchSvc.endMatch(db, await modernMatch('match:break')); },
        });
        expect(outcome.ok).toBe(true);
        const m = rowOf(state, 'matches', IDS['match:break']);
        expect([m.break_started_at, m.break_duration]).toEqual([null, null]);
        expect(writes(state)).toEqual(['UPDATE matches']);
    });

    it('started match with no rounds: ended, safe endRound is a no-op', async () => {
        const { state } = await parity({
            legacy: async () => { await (await legacyMatch('match:breakNoRounds')).end(); },
            modern: async () => { await MatchSvc.endMatch(db, await modernMatch('match:breakNoRounds')); },
        });
        expect(writes(state)).toEqual(['UPDATE matches']);
    });

    it.each([
        ['match:done',       'This match has already ended'],
        ['match:notStarted', 'This match has already not started'],
    ])('%s: throws "%s", writes nothing', async (key, message) => {
        const { state, outcome } = await parity({
            legacy: async () => { await (await legacyMatch(key)).end(); },
            modern: async () => { await MatchSvc.endMatch(db, await modernMatch(key)); },
        });
        expect(outcome).toEqual(fails(message));
        expect(state.audit).toEqual([]);
    });
});


describe('PARITY: startRound == Match#startRound (route: POST /match/:id/rounds)', () => {
    it('last round ended (in a break): inserts the next round, leaves the break fields alone', async () => {
        const { state } = await parity({
            legacy: async () => { await (await legacyMatch('match:toStartRound')).startRound(); },
            modern: async () => { await MatchSvc.startRound(db, IDS['match:toStartRound']); },
        });
        expect(writes(state)).toEqual(['INSERT rounds']);
        expect(rowOf(state, 'matches', IDS['match:toStartRound']).break_duration).toBe(60);
    });

    it('active round: throws "Cannot start a new round while there is an active round"', async () => {
        const { state, outcome } = await parity({
            legacy: async () => { await (await legacyMatch('match:open')).startRound(); },
            modern: async () => { await MatchSvc.startRound(db, IDS['match:open']); },
        });
        expect(outcome).toEqual(fails('Cannot start a new round while there is an active round'));
        expect(state.audit).toEqual([]);
    });

    it.each(['match:notStarted', 'match:done'])('%s: a round is created anyway (no started/ended check, F-56)', async (key) => {
        const { state } = await parity({
            legacy: async () => { await (await legacyMatch(key)).startRound(); },
            modern: async () => { await MatchSvc.startRound(db, IDS[key]); },
        });
        expect(writes(state)).toEqual(['INSERT rounds']);
    });
});


describe('PARITY: endRound == Match#endRound({safe}) + Round#end (route: POST /match/:id/rounds/end)', () => {
    const routeEnd = (key, opts) => ({
        legacy: async () => { await (await legacyMatch(key)).endRound(opts); },
        modern: async () => { await MatchSvc.endRound(db, IDS[key] ?? key, opts); },
    });

    it('mid-match round 1, no votes: round ended, 60s break started, match NOT ended', async () => {
        const { state } = await parity(routeEnd('match:toEndRound', { safe: false }));
        const m = rowOf(state, 'matches', IDS['match:toEndRound']);
        expect([m.ended_at, m.break_duration, m.break_started_at]).toEqual([null, 60, new Date(NOW).toISOString()]);
        expect(writes(state)).toEqual(['UPDATE rounds', 'UPDATE matches']);
    });

    it('open votes are closed first (vote close on end), then the round, then the break', async () => {
        const { state } = await parity(routeEnd('match:open', { safe: false }));
        expect(rowsOf(state, 'riding_time_votes', (v) => v.round_id === IDS['round:open']).every((v) => v.ended_at !== null)).toBe(true);
        expect(writes(state)).toEqual(['UPDATE riding_time_votes', 'UPDATE riding_time_votes', 'UPDATE rounds', 'UPDATE matches']);
    });

    it('open pause is resumed before the round ends', async () => {
        const { state } = await parity(routeEnd('match:paused', { safe: false }));
        expect(rowOf(state, 'round_pauses', IDS['pause:paused-open']).resumed_at).toBe(new Date(NOW).toISOString());
        expect(writes(state)).toEqual(['UPDATE round_pauses', 'UPDATE rounds', 'UPDATE matches']);
    });

    it('FINAL round: votes closed -> pause resumed -> round ended -> match ended -> endRound({safe:true}) returns silently', async () => {
        const { state, outcome } = await parity({ setup: (add) => finalRoundFixture(add), ...routeEnd(C.match, { safe: false }) });
        expect(outcome).toEqual({ ok: true, value: undefined });
        const m = rowOf(state, 'matches', C.match);
        expect(m.ended_at).toBe(new Date(NOW).toISOString());
        expect([m.break_started_at, m.break_duration]).toEqual([null, null]);
        expect(writes(state)).toEqual(['UPDATE riding_time_votes', 'UPDATE riding_time_votes', 'UPDATE round_pauses', 'UPDATE rounds', 'UPDATE matches']);
    });

    it('NO EARLY EXIT: red wins round 2 for a 2-0 lead, the match goes to a break, it does not end', async () => {
        const { state } = await parity({ setup: (add) => twoWinsFixture(add), ...routeEnd(C.match, { safe: false }) });
        const m = rowOf(state, 'matches', C.match);
        expect(m.ended_at).toBeNull();
        expect(m.break_duration).toBe(60);
    });

    it('4th round (round added to an ended match, F-56): no end, no break (getBreakDuration(4) = 0)', async () => {
        const { state } = await parity({
            setup: (add) => add('rounds', [{ id: C.r1, match_id: IDS['match:done'], ended_at: null, ...stamps(590), declared_winner_id: null, stoppage: null }]),
            ...routeEnd('match:done', { safe: false }),
        });
        expect(writes(state)).toEqual(['UPDATE rounds']);
    });

    it('never-started match with a 3rd round open: the round ends, then Match#end throws "has already not started"', async () => {
        const { outcome, state } = await parity({ setup: (add) => finalRoundFixture(add, { startedAt: null }), ...routeEnd(C.match, { safe: false }) });
        expect(outcome).toEqual(fails('This match has already not started'));
        expect(rowOf(state, 'rounds', C.r3).ended_at).not.toBeNull();
    });

    it('several open votes (incl. two by one judge) are all closed, in insertion order', async () => {
        const { state } = await parity({
            setup: (add) => {
                addMatch(add);
                addRound(add, C.r1, { start: 500 });
                addVote(add, C.v0, { round: C.r1, judge: IDS['user:judgeA'], competitor: IDS['user:red'],  start: 505, end: 510 });
                addVote(add, C.v1, { round: C.r1, judge: IDS['user:judgeA'], competitor: IDS['user:red'],  start: 520 });
                addVote(add, C.v2, { round: C.r1, judge: IDS['user:judgeA'], competitor: IDS['user:blue'], start: 521 });
                addVote(add, C.v3, { round: C.r1, judge: IDS['user:judgeB'], competitor: IDS['user:red'],  start: 522 });
            },
            ...routeEnd(C.match, { safe: false }),
        });
        expect(state.audit.filter((e) => e.tbl === 'riding_time_votes').map((e) => e.row.id)).toEqual([C.v1, C.v2, C.v3]);
    });

    it('two open pauses: only the LAST one is resumed, the earlier stays open after the round ends', async () => {
        const { state } = await parity({
            setup: (add) => {
                addMatch(add);
                addRound(add, C.r1, { start: 500 });
                add('round_pauses', [
                    { id: C.p1, round_id: C.r1, paused_at: iso(510), resumed_at: null, ...stamps(510) },
                    { id: C.p2, round_id: C.r1, paused_at: iso(520), resumed_at: null, ...stamps(520) },
                ]);
            },
            ...routeEnd(C.match, { safe: false }),
        });
        expect(rowOf(state, 'round_pauses', C.p1).resumed_at).toBeNull();
        expect(rowOf(state, 'round_pauses', C.p2).resumed_at).not.toBeNull();
    });

    it.each([
        ['match:break',      { safe: false }, 'No available round to end'],
        ['match:break',      undefined,       'No available round to end'],
        ['match:break',      { safe: true },  null],
        ['match:notStarted', { safe: false }, 'No available round to end'],
        ['match:notStarted', { safe: true },  null],
        ['match:notStarted', {},              'No available round to end'],
    ])('%s with %p: %s', async (key, opts, message) => {
        const { state, outcome } = await parity(routeEnd(key, opts));
        expect(outcome).toEqual(message ? fails(message) : { ok: true, value: undefined });
        expect(state.audit).toEqual([]);
    });
});


describe('PARITY: worker-driven paths (the REAL legacy workers vs the service call they make)', () => {
    it('TechFallTracker: an open round over the threshold is ended via match.endRound() (no safe)', async () => {
        const { state } = await parity({
            legacy: () => runLegacyWorker(L.TechFallTrackerWorker, { roundIds: [IDS['round:wsTechFall']] }),
            modern: async () => {
                for (const round of (await Rounds.findOpenRounds(db)).filter((r) => r.id === IDS['round:wsTechFall'])) {
                    const match = await Matches.findMatchById(db, round.match_id);
                    await MatchSvc.endRound(db, match.id);
                }
            },
        });
        expect(rowOf(state, 'rounds', IDS['round:wsTechFall']).ended_at).not.toBeNull();
        expect(rowOf(state, 'matches', IDS['match:wsTechFall']).break_duration).toBe(60);
    });

    it('RoundTimer: an expired round 1 is ended', async () => {
        const { state } = await parity({
            at: at(540 + 180),
            legacy: () => runLegacyWorker(L.RoundTimerWorker, { roundIds: [IDS['round:toEndRound']] }),
            modern: async () => { await MatchSvc.endRound(db, (await Rounds.findOpenRounds(db)).find((r) => r.id === IDS['round:toEndRound']).match_id); },
        });
        expect(rowOf(state, 'rounds', IDS['round:toEndRound']).ended_at).toBe(iso(720));
    });

    it('RoundTimer: an expired FINAL round ends the match', async () => {
        const { state } = await parity({
            setup: (add) => finalRoundFixture(add, {}, { pause: false }),
            legacy: () => runLegacyWorker(L.RoundTimerWorker, { roundIds: [C.r3] }),
            modern: async () => { await MatchSvc.endRound(db, C.match); },
        });
        expect(rowOf(state, 'matches', C.match).ended_at).not.toBeNull();
    });

    it('BreakTransition: expired break -> break cleared, next round started', async () => {
        const id = IDS['match:wsBreakEnded'];
        const { state } = await parity({
            legacy: () => runLegacyWorker(L.BreakTransitionWorker, { matchIds: [id] }),
            modern: async () => {
                for (const match of (await Matches.findMatchesInBreak(db)).filter((m) => m.id === id)) {
                    await Matches.updateMatch(db, match.id, { break_started_at: null, break_duration: null });
                    await MatchSvc.startRound(db, match.id);
                }
            },
        });
        expect(writes(state)).toEqual(['UPDATE matches', 'INSERT rounds']);
    });

    it('race: a second worker endRound() on the just-ended round throws "No available round to end" (F-58)', async () => {
        const key = 'match:toEndRound';
        const { outcome } = await parity({
            legacy: async () => { await (await legacyMatch(key)).endRound(); await (await legacyMatch(key)).endRound(); },
            modern: async () => { await MatchSvc.endRound(db, IDS[key]); await MatchSvc.endRound(db, IDS[key]); },
        });
        expect(outcome).toEqual(fails('No available round to end'));
    });
});


describe('PARITY: pauseRound / resumeRound == Round#pause / Round#resume', () => {
    const lastRoundCmd = (key, legacyFn, modernFn) => ({
        legacy: async () => { await legacyFn(await legacyLastRound(key)); },
        modern: async () => { await modernFn(await modernLastRound(key)); },
    });

    it('pause an active round', async () => {
        const { state } = await parity(lastRoundCmd('match:toPause', (r) => r.pause(), (r) => RoundSvc.pauseRound(db, r)));
        expect(writes(state)).toEqual(['INSERT round_pauses']);
    });

    it.each([
        ['match:paused', 'Round is already paused'],
        ['match:break',  'Round has already ended'],
    ])('pause %s: throws "%s"', async (key, message) => {
        const { outcome, state } = await parity(lastRoundCmd(key, (r) => r.pause(), (r) => RoundSvc.pauseRound(db, r)));
        expect(outcome).toEqual(fails(message));
        expect(state.audit).toEqual([]);
    });

    it('resume a paused round', async () => {
        const { state } = await parity(lastRoundCmd('match:paused', (r) => r.resume(), (r) => RoundSvc.resumeRound(db, r)));
        expect(writes(state)).toEqual(['UPDATE round_pauses']);
    });

    it('resume a round that is not paused: throws "Round is not paused"', async () => {
        const { outcome } = await parity(lastRoundCmd('match:toPause', (r) => r.resume(), (r) => RoundSvc.resumeRound(db, r)));
        expect(outcome).toEqual(fails('Round is not paused'));
    });

    it('resume closes the LAST open pause', async () => {
        const { state } = await parity({
            setup: (add) => {
                addMatch(add);
                addRound(add, C.r1, { start: 500 });
                add('round_pauses', [
                    { id: C.p1, round_id: C.r1, paused_at: iso(510), resumed_at: null, ...stamps(510) },
                    { id: C.p2, round_id: C.r1, paused_at: iso(520), resumed_at: null, ...stamps(520) },
                ]);
            },
            ...lastRoundCmd(C.match, (r) => r.resume(), (r) => RoundSvc.resumeRound(db, r)),
        });
        expect(state.audit.map((e) => e.row.id)).toEqual([C.p2]);
    });

    it('pause, resume, pause again on the same round', async () => {
        const { state } = await parity({
            legacy: async () => { await (await legacyLastRound('match:toPause')).pause(); await (await legacyLastRound('match:toPause')).resume(); await (await legacyLastRound('match:toPause')).pause(); },
            modern: async () => { await RoundSvc.pauseRound(db, await modernLastRound('match:toPause')); await RoundSvc.resumeRound(db, await modernLastRound('match:toPause')); await RoundSvc.pauseRound(db, await modernLastRound('match:toPause')); },
        });
        expect(writes(state)).toEqual(['INSERT round_pauses', 'UPDATE round_pauses', 'INSERT round_pauses']);
    });
});


describe('PARITY: setRoundResult == Round#setResult (route: PATCH /match/:id/rounds/result)', () => {
    // The controller always passes BOTH keys: { winner: params.winner, stoppage: params.stoppage }.
    const setResult = (key, winner, stoppage, times = 1) => ({
        legacy: async () => { for (let i = 0; i < times; i++) await (await legacyLastRound(key)).setResult({ winner, stoppage }); },
        modern: async () => { for (let i = 0; i < times; i++) await RoundSvc.setRoundResult(db, await modernLastRound(key), { winner, stoppage }); },
    });

    it.each([
        ['match:toSubmission',  'red',   false],
        ['match:toSubmission',  'red',   undefined],
        ['match:toStoppage',    'blue',  true],
        ['match:toSubmission',  'RED',   true],
        ['match:toClearResult', undefined, undefined],
        ['match:toClearResult', null,    true],
        ['match:done',          'blue',  false],
    ])('%s winner=%p stoppage=%p', async (key, winner, stoppage) => {
        const { state } = await parity(setResult(key, winner, stoppage));
        expect(writes(state)).toEqual(['UPDATE rounds']);
    });

    it.each([
        ['clear an already-empty result',          'match:toSubmission',  undefined, undefined, 1],
        ['clear twice',                            'match:toClearResult', undefined, undefined, 2],
        ['same winner, stoppage null, twice',      'match:toSubmission',  'red',     null,      2],
        ['same winner and stoppage true, twice',   'match:toStoppage',    'blue',    true,      2],
        ['same winner and stoppage false, twice',  'match:toStoppage',    'blue',    false,     2],
    ])('no-op saves: %s', async (_label, key, winner, stoppage, times) => {
        await parity(setResult(key, winner, stoppage, times));
    });

    it('a round that has not ended: throws "Cannot set result on a round that has not ended"', async () => {
        const { outcome } = await parity(setResult('match:open', 'red', false));
        expect(outcome).toEqual(fails('Cannot set result on a round that has not ended'));
    });

    it('unknown colour: the same TypeError as the legacy dynamic dispatch', async () => {
        const { outcome } = await parity(setResult('match:toSubmission', 'green', false));
        expect(outcome.error).toBe('TypeError');
    });

    it('winner whose competitor row is missing: declared_winner_id left unchanged (competitor?.id is undefined), stoppage written', async () => {
        const { state } = await parity({
            setup: (add) => { addMatch(add, { red: C.ghostUser, breakStartedAt: 590, breakDuration: 60 }); addRound(add, C.r1, { start: 500, end: 590, winner: IDS['user:blue'], stoppage: 1 }); },
            ...setResult(C.match, 'red', false),
        });
        expect(rowOf(state, 'rounds', C.r1).declared_winner_id).toBe(IDS['user:blue']);
        expect(rowOf(state, 'rounds', C.r1).stoppage).toBe(0);
    });

    // KNOWN, PINNED DIVERGENCE (FINDINGS F-59). The legacy route does not
    // validate `stoppage`, and Sequelize writes a non-boolean verbatim into
    // the TINYINT column; the service's contract is `boolean | null` and
    // Drizzle's boolean column stores 1/0. The task-05 request schema
    // (`stoppage: z.boolean().optional()`) rejects such a body in 13b anyway.
    it('DIVERGENCE (pinned): a non-boolean stoppage is stored verbatim by legacy, as 1/0 by the service', async () => {
        resetBoth();
        setSystemTime(new Date(NOW));
        try {
            await (await legacyLastRound('match:toStoppage')).setResult({ winner: 'blue', stoppage: 'yes' });
            await RoundSvc.setRoundResult(db, await modernLastRound('match:toStoppage'), { winner: 'blue', stoppage: 'yes' });
        } finally {
            setSystemTime();
        }
        const q = 'SELECT declared_winner_id, stoppage FROM rounds WHERE id = ?';
        expect(legacyDb.query(q).get(IDS['round:toStoppage'])).toEqual({ declared_winner_id: IDS['user:blue'], stoppage: 'yes' });
        expect(db.$client.query(q).get(IDS['round:toStoppage'])).toEqual({ declared_winner_id: IDS['user:blue'], stoppage: 1 });
    });
});


describe('PARITY: startRidingTime / endRidingTime / endVote == Round#startRidingTime / #endRidingTime / RidingTimeVote#end', () => {
    const judge = (k) => IDS[`user:${k}`];
    const start = (key, judgeKey, rider) => ({
        legacy: async () => { await (await legacyLastRound(key)).startRidingTime(await L.User.find(judge(judgeKey)), rider); },
        modern: async () => { await VoteSvc.startRidingTime(db, await modernLastRound(key), judge(judgeKey), rider); },
    });
    const end = (key, judgeKey, rider) => ({
        legacy: async () => { await (await legacyLastRound(key)).endRidingTime(await L.User.find(judge(judgeKey)), rider); },
        modern: async () => { await VoteSvc.endRidingTime(db, await modernLastRound(key), judge(judgeKey), rider); },
    });

    it('start a vote', async () => {
        const { state } = await parity(start('match:toVote', 'judgeA', 'red'));
        expect(state.audit.map((e) => [e.op, e.row.competitor_id, e.row.judge_id])).toEqual([['INSERT', IDS['user:red'], judge('judgeA')]]);
    });

    it('start while the judge already has an open vote: "Riding time is already active"', async () => {
        const { outcome } = await parity(start('match:open', 'judgeA', 'red'));
        expect(outcome).toEqual(fails('Riding time is already active'));
    });

    it('end the open vote', async () => {
        const { state } = await parity(end('match:open', 'judgeA', 'blue'));
        expect(writes(state)).toEqual(['UPDATE riding_time_votes']);
    });

    it('end ignores the rider colour (F-55): a red vote is ended by a "blue" end', async () => {
        const { state } = await parity({
            setup: (add) => { addMatch(add); addRound(add, C.r1, { start: 500 }); addVote(add, C.v1, { round: C.r1, judge: judge('judgeA'), competitor: IDS['user:red'], start: 510 }); },
            ...end(C.match, 'judgeA', 'blue'),
        });
        expect(state.audit.map((e) => e.row.id)).toEqual([C.v1]);
    });

    it('end with no open vote: "Riding time is not active"', async () => {
        const { outcome } = await parity(end('match:toVote', 'judgeA', 'red'));
        expect(outcome).toEqual(fails('Riding time is not active'));
    });

    it('start, end, start again', async () => {
        const { state } = await parity({
            legacy: async () => { const u = await L.User.find(judge('judgeB')); await (await legacyLastRound('match:toVote')).startRidingTime(u, 'blue'); await (await legacyLastRound('match:toVote')).endRidingTime(u, 'blue'); await (await legacyLastRound('match:toVote')).startRidingTime(u, 'Red'); },
            modern: async () => { const r = () => modernLastRound('match:toVote'); await VoteSvc.startRidingTime(db, await r(), judge('judgeB'), 'blue'); await VoteSvc.endRidingTime(db, await r(), judge('judgeB'), 'blue'); await VoteSvc.startRidingTime(db, await r(), judge('judgeB'), 'Red'); },
        });
        expect(writes(state)).toEqual(['INSERT riding_time_votes', 'UPDATE riding_time_votes', 'INSERT riding_time_votes']);
    });

    it.each([['green'], [undefined]])('rider %p: the same TypeError as legacy', async (rider) => {
        const { outcome, state } = await parity(start('match:toVote', 'judgeA', rider));
        expect(outcome.error).toBe('TypeError');
        expect(state.audit).toEqual([]);
    });

    it('missing competitor row: TypeError on competitor.id, nothing written', async () => {
        const { outcome, state } = await parity({
            setup: (add) => { addMatch(add, { red: C.ghostUser }); addRound(add, C.r1, { start: 500 }); },
            ...start(C.match, 'judgeA', 'red'),
        });
        expect(outcome.error).toBe('TypeError');
        expect(state.audit).toEqual([]);
    });

    it('endVote (judge leaving a mat mid-round, usersController.js:153)', async () => {
        const { state } = await parity({
            legacy: async () => { const round = await legacyLastRound('match:soloJudge'); await (await round.currentRidingTimeVoteForJudge(await L.User.find(judge('judgeA')))).end(); },
            modern: async () => { await VoteSvc.endVote(db, await Votes.findOpenVoteForJudge(db, IDS['round:soloJudge'], judge('judgeA'))); },
        });
        expect(writes(state)).toEqual(['UPDATE riding_time_votes']);
    });
});


describe('ONE implementation, two callers: route-style and worker-style calls of the same service give identical state', () => {
    async function stateAfter(fn, when = NOW) {
        resetBoth();
        const known = H.idsIn(db.$client);
        setSystemTime(new Date(when));
        let outcome;
        try { outcome = await H.settle(fn); } finally { setSystemTime(); }
        return { outcome, state: H.normalize(H.dump(db.$client), known) };
    }

    it('endRound: route (findMatchById + {safe:false}) == worker (findOpenRounds -> match -> no options)', async () => {
        const key = 'match:open';
        const route  = await stateAfter(async () => { const match = await Matches.findMatchById(db, IDS[key]); await MatchSvc.endRound(db, match.id, { safe: false }); });
        const worker = await stateAfter(async () => {
            const round = (await Rounds.findOpenRounds(db)).find((r) => r.match_id === IDS[key]);
            const match = await Matches.findMatchById(db, round.match_id);
            await MatchSvc.endRound(db, match.id);
        });
        expect(route.outcome).toEqual({ ok: true, value: undefined });
        expect(worker).toEqual(route);
        expect(route.state.audit.length).toBe(4);
    });

    it('startRound: route (findMatchById) == worker (findMatchesInBreak)', async () => {
        const key = 'match:toStartRound';
        const route  = await stateAfter(async () => { await MatchSvc.startRound(db, (await Matches.findMatchById(db, IDS[key])).id); });
        const worker = await stateAfter(async () => { await MatchSvc.startRound(db, (await Matches.findMatchesInBreak(db)).find((m) => m.id === IDS[key]).id); });
        expect(worker).toEqual(route);
        expect(route.state.generated).toBe(1);
    });

    it('endVote: ridingTime route (endRidingTime) == mat leave route (findOpenVoteForJudge + endVote)', async () => {
        const judgeId = IDS['user:judgeA'];
        const viaRidingTime = await stateAfter(async () => { await VoteSvc.endRidingTime(db, await Rounds.findLastRound(db, IDS['match:soloJudge']), judgeId, 'red'); });
        const viaLeave      = await stateAfter(async () => { await VoteSvc.endVote(db, await Votes.findOpenVoteForJudge(db, IDS['round:soloJudge'], judgeId)); });
        expect(viaLeave).toEqual(viaRidingTime);
        expect(viaRidingTime.state.audit).toHaveLength(1);
    });
});
