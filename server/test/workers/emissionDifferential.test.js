const { afterAll, beforeAll, describe, expect, it, setSystemTime } = require('bun:test');
/**
 * DIFFERENTIAL: the worker jobs in src/workers (Drizzle) against the legacy
 * jobs in lib/workerQueue (Sequelize), run through the same scripted
 * timelines on two separate, identically seeded scratch databases:
 *
 *   - legacy: a temp FILE built by the legacy migrations; only the legacy
 *     workers and models touch it.
 *   - modern: an in-memory DB built by the Drizzle baseline; only the new
 *     workers and services touch it.
 *
 * The clock is frozen at each step (setSystemTime). At every step both sides
 * run the same jobs in the same order with persistent worker instances (the
 * match-update job's throttle and active-set memory carry across steps), and
 * every emission is captured at the `notifyServer` seam as
 * (step, job, event, room, payload). Required: identical ordered emissions,
 * identical tables and an identical write log (audit triggers) after every
 * step, and identical outcomes (a rejected tick counts as an outcome).
 * Generated ids (new rounds) are labelled by first appearance on each side.
 *
 * Every new payload is also checked against its event schema.
 */
const Http = require('../helpers/httpServer');

const previousDatabasePath = process.env.DATABASE_PATH;
const file = Http.useTemporaryDatabase('accord-worker-differential');

const H = require('../services/support');
const Modern   = require('../../src/workers');
const { assertSocketPayload } = require('../../src/workers/worker');
const MatchSvc = require('../../src/services/matchLifecycle');
const RoundSvc = require('../../src/services/roundLifecycle');
const Matches  = require('../../src/db/repositories/matches');
const Rounds   = require('../../src/db/repositories/rounds');

const T0  = Date.parse('2026-03-01T12:00:00.000Z');
const iso = (s) => new Date(T0 + s * 1000).toISOString();
const X   = (suffix) => `00000000-0000-4000-9000-${String(suffix).padStart(12, '0')}`;
const stamps = (s) => ({ created_at: iso(s), updated_at: iso(s) });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const U = {
    creator: X('c0'), judgeA: X('c1'), judgeB: X('c2'),
};
for (let k = 1; k <= 9; k++) { U[`red${k}`] = X(`d${k}0`); U[`blue${k}`] = X(`d${k}1`); }
const MAT = X('a0');

let L;        // legacy models + workers
let legacyDb; // raw bun:sqlite handle on the legacy file (restore / dump only)
let db;       // Drizzle-baseline DB
let snap;
let known;

beforeAll(async () => {
    await Http.migrate();
    L = {
        Match: require('../../models/match').Match,
        TechFallTrackerWorker: require('../../lib/workerQueue/techFallTrackerWorker').TechFallTrackerWorker,
        MatchUpdateWorker:     require('../../lib/workerQueue/matchUpdateWorker').MatchUpdateWorker,
        BreakTransitionWorker: require('../../lib/workerQueue/breakTransitionWorker').BreakTransitionWorker,
        RoundTimerWorker:      require('../../lib/workerQueue/roundTimerWorker').RoundTimerWorker,
    };
    legacyDb = H.legacyClient(file);
    db = H.modernDb();

    const users = Object.entries(U).map(([name, id], i) => ({ id, name, api_token: X(`7${i}`), ...stamps(-1000) }));
    H.insertRaw(legacyDb, 'users', users);
    H.insertRaw(legacyDb, 'mats', [{ id: MAT, name: 'mat', judge_count: 2, creator_id: U.creator, ...stamps(-1000) }]);
    H.insertRaw(legacyDb, 'judges_mats', [U.judgeA, U.judgeB].map((user_id) => ({ mat_id: MAT, user_id, ...stamps(-1000) })));
    snap  = H.snapshot(legacyDb);
    known = H.idsIn(legacyDb);
}, 30000);

afterAll(() => {
    setSystemTime();
    if (legacyDb) legacyDb.close();
    if (db) db.$client.close();
    if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
});


/* ---------------------------------------------------------------------------
 * Fixtures (raw rows, written identically into both DBs)
 * ------------------------------------------------------------------------- */

function fixtures() {
    const rows = [];
    const add = (table, row) => rows.push([table, row]);
    const api = {
        rows,
        match(id, k, { started = -300, ended = null, breakStarted = null, breakDuration = null, judges = true } = {}) {
            add('matches', {
                id, creator_id: U.creator, mat_id: MAT, red_competitor_id: U[`red${k}`], blue_competitor_id: U[`blue${k}`],
                red_score: 0, blue_score: 0, started_at: started == null ? null : iso(started), ended_at: ended == null ? null : iso(ended),
                ...stamps(-400), break_started_at: breakStarted == null ? null : iso(breakStarted), break_duration: breakDuration,
            });
            if (judges) for (const user_id of [U.judgeA, U.judgeB]) add('judges_matches', { match_id: id, user_id, ...stamps(-350) });
            return api;
        },
        round(id, matchId, { start, end = null, winner = null, stoppage = null }) {
            add('rounds', { id, match_id: matchId, ended_at: end == null ? null : iso(end), ...stamps(start), declared_winner_id: winner, stoppage });
            return api;
        },
        votes(idBase, roundId, competitor, { start, end = null }) {
            [U.judgeA, U.judgeB].forEach((judge, i) => add('riding_time_votes', {
                id: X(`${idBase}${i}`), round_id: roundId, judge_id: judge, competitor_id: competitor,
                ended_at: end == null ? null : iso(end), ...stamps(start),
            }));
            return api;
        },
        pause(id, roundId, { at, resumed = null }) {
            add('round_pauses', { id, round_id: roundId, paused_at: iso(at), resumed_at: resumed == null ? null : iso(resumed), ...stamps(at) });
            return api;
        },
    };
    return api;
}

/**
 * The write log, grouped by the match each write belongs to (stable within a
 * match). Like the emissions, the legacy jobs handle several matches
 * concurrently, so writes for different matches interleave in an order that
 * varies from run to run; the order of the writes for one match is exact.
 */
function canonicalAudit(dump) {
    const roundToMatch = new Map(dump.tables.rounds.map((r) => [r.id, r.match_id]));
    const owner = ({ tbl, row }) => {
        if (tbl === 'matches') return row.id;
        if (tbl === 'rounds' || tbl === 'judges_matches') return row.match_id;
        if (tbl === 'riding_time_votes' || tbl === 'round_pauses') return roundToMatch.get(row.round_id) || '';
        return '';
    };
    const audit = dump.audit
        .map((entry, index) => ({ entry, index, owner: owner(entry) }))
        .sort((a, b) => a.owner.localeCompare(b.owner) || a.index - b.index)
        .map((x) => x.entry);
    return { ...dump, audit };
}

function load(fx) {
    H.restore(legacyDb, snap);
    H.restore(db.$client, snap);
    const byTable = new Map();
    for (const [table, row] of fx.rows) {
        if (!byTable.has(table)) byTable.set(table, []);
        byTable.get(table).push(row);
    }
    for (const [table, rows] of byTable) {
        H.insertRaw(legacyDb, table, rows);
        H.insertRaw(db.$client, table, rows);
    }
    known = H.idsIn(legacyDb);
}


/* ---------------------------------------------------------------------------
 * The scenarios
 * ------------------------------------------------------------------------- */

const ALL = ['techFall', 'breakTransition', 'roundTimer', 'matchUpdate'];
const MU  = ['matchUpdate'];

/** Steps every 250 ms from `from` to `to` (ms): the match-update job on each, every job on whole seconds. */
function ticks(from, to, order = ALL) {
    const steps = [];
    for (let at = from; at <= to; at += 250) steps.push({ at, jobs: at % 1000 === 0 ? order : MU });
    return steps;
}

/** Actions that stand in for HTTP requests, done on each side the way that side's route does it. */
const ACTIONS = {
    pause: (matchId) => ({
        legacy: async () => (await (await L.Match.find(matchId)).getLastRound()).pause(),
        modern: async () => RoundSvc.pauseRound(db, await Rounds.findLastRound(db, matchId)),
    }),
    resume: (matchId) => ({
        legacy: async () => (await (await L.Match.find(matchId)).getLastRound()).resume(),
        modern: async () => RoundSvc.resumeRound(db, await Rounds.findLastRound(db, matchId)),
    }),
    startMatch: (matchId) => ({
        legacy: async () => (await L.Match.find(matchId)).start(),
        modern: async () => MatchSvc.startMatch(db, await Matches.findMatchById(db, matchId)),
    }),
    endMatch: (matchId) => ({
        legacy: async () => (await L.Match.find(matchId)).end(),
        modern: async () => MatchSvc.endMatch(db, await Matches.findMatchById(db, matchId)),
    }),
};

const M = {
    open: X('100'), paused: X('200'), brk: X('300'), tf1: X('400'), tf3: X('500'),
    timer1: X('600'), timer3: X('700'), starter: X('800'), ender: X('900'),
};
const ALL_AT_ONCE = ['open', 'paused', 'brk', 'tf1', 'tf3', 'timer1', 'timer3', 'starter', 'ender'];

/** Each builder adds its matches to `fx`. Seconds are relative to T0 (time 0). */
const BUILD = {
    // Round 1 open, both judges giving red control from -8 s.
    open:   (fx) => fx.match(M.open, 1).round(X('101'), M.open, { start: -10 }).votes('10', X('101'), U.red1, { start: -8 }),
    // Round 1 open, no votes; paused and resumed by actions.
    paused: (fx) => fx.match(M.paused, 2).round(X('201'), M.paused, { start: -20 }),
    // Round 1 ended at -5 s, break of 60 s running since then (expires at 55 s).
    brk:    (fx) => fx.match(M.brk, 3, { breakStarted: -5, breakDuration: 60 }).round(X('301'), M.brk, { start: -200, end: -5 }),
    // Round 1 open; red consensus since -70 s reaches the round-1 threshold (24 points, 72 s) at 2 s.
    tf1:    (fx) => fx.match(M.tf1, 4).round(X('401'), M.tf1, { start: -80 }).votes('40', X('401'), U.red4, { start: -70 }),
    // Rounds 1-2 ended; round 3 open, blue consensus since -22 s reaches the round-3 threshold (8 points, 24 s) at 2 s: the match ends.
    tf3:    (fx) => fx.match(M.tf3, 5)
        .round(X('501'), M.tf3, { start: -500, end: -320, winner: U.red5, stoppage: 0 })
        .round(X('502'), M.tf3, { start: -260, end: -140 })
        .votes('51', X('502'), U.blue5, { start: -250, end: -150 })
        .round(X('503'), M.tf3, { start: -25 })
        .votes('52', X('503'), U.blue5, { start: -22 }),
    // Round 1 (180 s) open since -178 s with a 1 s pause: expires at 3 s.
    timer1: (fx) => fx.match(M.timer1, 6).round(X('601'), M.timer1, { start: -178 }).pause(X('602'), X('601'), { at: -100, resumed: -99 }),
    // Rounds 1-2 ended; round 3 (60 s) open since -58 s: expires at 2 s and the match ends.
    timer3: (fx) => fx.match(M.timer3, 7)
        .round(X('701'), M.timer3, { start: -500, end: -320 })
        .round(X('702'), M.timer3, { start: -260, end: -140 })
        .round(X('703'), M.timer3, { start: -58 })
        .votes('71', X('703'), U.red7, { start: -50, end: -30 }),
    // Not started; started by an action (POST /match/:id/start) at 2 s.
    starter: (fx) => fx.match(M.starter, 8, { started: null, judges: false }),
    // Invalid state: a break that has expired while round 2 is still open. Starting round 3 throws.
    stuck:  (fx) => fx.match(X('a00'), 4, { breakStarted: -70, breakDuration: 60 })
        .round(X('a01'), X('a00'), { start: -300, end: -120 })
        .round(X('a02'), X('a00'), { start: -60 }),
    // Round 1 open; ended by the master (POST /match/:id/end) at 1 s, which leaves a break on the ended match.
    ender:  (fx) => fx.match(M.ender, 9).round(X('901'), M.ender, { start: -40 }).votes('90', X('901'), U.red9, { start: -30 }),
};

const SCENARIOS = [
    {
        name: 'idle ticks: nothing to do, nothing emitted',
        build: [],
        steps: ticks(0, 3000),
        expect: { emissions: 0 },
    },
    {
        name: 'round in progress: match.update about once a second on a 250 ms tick',
        build: ['open'],
        steps: ticks(0, 3000),
        expect: { emissions: 4, events: { 'match.update': 4 } },
    },
    {
        name: 'a paused and resumed round',
        build: ['paused'],
        steps: ticks(0, 4000).map((s) => ({ ...s, actions: s.at === 750 ? [ACTIONS.pause(M.paused)] : s.at === 2500 ? [ACTIONS.resume(M.paused)] : [] })),
        expect: { events: { 'match.update': 5 } },
    },
    {
        name: 'a break counting down, then expiring and starting the next round',
        build: ['brk'],
        steps: [...ticks(0, 2000), ...ticks(54000, 57000)],
        expect: { events: { 'break.ended': 1 } },
    },
    {
        name: 'tech fall in round 1 (round.tech-fall, then a break)',
        build: ['tf1'],
        steps: ticks(0, 6000),
        expect: { events: { 'round.tech-fall': 1 } },
    },
    {
        name: 'tech fall in the final round ends the match (one final match.update)',
        build: ['tf3'],
        steps: ticks(0, 5000),
        expect: { events: { 'round.tech-fall': 1 } },
    },
    {
        name: 'round timer expiry in round 1 (pauses excluded)',
        build: ['timer1'],
        steps: ticks(0, 5000),
        expect: { rounds: 2 },
    },
    {
        name: 'round timer expiry in the final round ends the match (one final match.update, then silence)',
        build: ['timer3'],
        steps: ticks(0, 6000),
    },
    {
        name: 'a tick that rejects (expired break over an open round): same error, same writes, nothing emitted by it',
        build: ['stuck'],
        steps: ticks(0, 2000),
        expect: { rejections: 1 },
    },
    {
        name: 'all at once: concurrent matches, a match ending and one starting in the same tick, a master-ended match',
        build: ALL_AT_ONCE,
        steps: [...ticks(0, 8000), ...ticks(54000, 57000)].map((s) => ({
            ...s,
            actions: [
                ...(s.at === 750  ? [ACTIONS.pause(M.paused)] : []),
                ...(s.at === 1000 ? [ACTIONS.endMatch(M.ender)] : []),
                // timer3 ends in this same tick.
                ...(s.at === 2000 ? [ACTIONS.startMatch(M.starter)] : []),
                ...(s.at === 2500 ? [ACTIONS.resume(M.paused)] : []),
            ],
        })),
    },
    {
        name: 'all at once, with the match-update job running FIRST on whole seconds',
        build: ALL_AT_ONCE,
        steps: [...ticks(0, 6000, ['matchUpdate', 'roundTimer', 'breakTransition', 'techFall']), ...ticks(54000, 56000)].map((s) => ({
            ...s,
            actions: [
                ...(s.at === 1000 ? [ACTIONS.endMatch(M.ender)] : []),
                ...(s.at === 2000 ? [ACTIONS.startMatch(M.starter)] : []),
            ],
        })),
    },
];


/* ---------------------------------------------------------------------------
 * Harness
 * ------------------------------------------------------------------------- */

function labeller() {
    const labels = new Map();
    const walk = (value) => {
        if (typeof value === 'string') {
            if (UUID_RE.test(value) && !known.has(value)) {
                if (!labels.has(value)) labels.set(value, `<gen:${labels.size}>`);
                return labels.get(value);
            }
            return value;
        }
        if (Array.isArray(value)) return value.map(walk);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [walk(k), walk(v)]));
        return value;
    };
    return walk;
}

function workersFor(side) {
    const make = side === 'legacy'
        ? (Cls) => new Cls('differential-worker')
        : (Cls) => new Cls('differential-worker', { db });
    const source = side === 'legacy' ? L : Modern;
    return {
        techFall:        make(source.TechFallTrackerWorker),
        breakTransition: make(source.BreakTransitionWorker),
        roundTimer:      make(source.RoundTimerWorker),
        matchUpdate:     make(source.MatchUpdateWorker),
    };
}

/** Statements per job run, per side. */
const statements = { legacy: [], modern: [] };

function countLegacyStatements(fn) {
    const sequelize = L.Match.sequelize;
    const previous  = sequelize.options.logging;
    let n = 0;
    sequelize.options.logging = () => { n++; };
    return fn().finally(() => { sequelize.options.logging = previous; }).then(() => n);
}

function countModernStatements(fn) {
    const client = db.$client;
    const prepare = client.prepare;
    let n = 0;
    client.prepare = function (...args) { n++; return prepare.apply(this, args); };
    return fn().finally(() => { client.prepare = prepare; }).then(() => n);
}

async function runSide(side, scenario, emissions, states) {
    const workers = workersFor(side);
    for (const name of Object.keys(workers)) {
        workers[name].notifyServer = (event, payload) => {
            if (side === 'modern') assertSocketPayload(event, payload);
            emissions.push({ step: workers.__step, job: name, event, room: `match:${payload.id}`, payload: JSON.parse(JSON.stringify(payload)) });
        };
    }
    const client = side === 'legacy' ? legacyDb : db.$client;
    const count  = side === 'legacy' ? countLegacyStatements : countModernStatements;
    for (const [i, step] of scenario.steps.entries()) {
        setSystemTime(new Date(T0 + step.at));
        workers.__step = `${i}@${step.at}`;
        for (const action of step.actions || []) {
            const outcome = await H.settle(action[side]);
            emissions.push({ step: workers.__step, action: true, outcome });
        }
        for (const job of step.jobs) {
            let outcome;
            const n = await count(async () => { outcome = await H.settle(() => workers[job].performJob()); });
            statements[side].push({ scenario: scenario.name, at: step.at, job, n });
            if (!outcome.ok) emissions.push({ step: workers.__step, job, rejected: outcome });
        }
        states.push({ step: workers.__step, ...H.normalize(canonicalAudit(H.dump(client)), known) });
    }
    for (const w of Object.values(workers)) if (typeof w.close === 'function') w.close();
}

/**
 * Within one job run, emissions for DIFFERENT rooms may come out in a
 * different order: the legacy job renders matches concurrently and emits in
 * completion order, the new one in query order. No client can observe that
 * order (each room is its own stream), so each (step, job) group is sorted by
 * room, stably: the order within a room, and the order of steps and jobs, is
 * compared exactly.
 */
function canonical(emissions) {
    const groups = new Map();
    const keyed = emissions.map((e, index) => {
        const group = `${e.step}|${e.job || 'action'}`;
        if (!groups.has(group)) groups.set(group, groups.size);
        return { e, index, group: groups.get(group) };
    });
    keyed.sort((a, b) => a.group - b.group || String(a.e.room || '').localeCompare(String(b.e.room || '')) || a.index - b.index);
    return keyed.map((k) => k.e);
}

async function differential(scenario) {
    const fx = fixtures();
    for (const key of scenario.build) BUILD[key](fx);
    load(fx);

    const legacy = { emissions: [], states: [] };
    const modern = { emissions: [], states: [] };
    try {
        await runSide('legacy', scenario, legacy.emissions, legacy.states);
        await runSide('modern', scenario, modern.emissions, modern.states);
    } finally {
        setSystemTime();
    }
    const l = labeller();
    const m = labeller();
    return {
        legacy: { emissions: l(canonical(legacy.emissions)), states: legacy.states, raw: legacy.emissions },
        modern: { emissions: m(canonical(modern.emissions)), states: modern.states, raw: modern.emissions },
    };
}

const results = new Map();


/* ---------------------------------------------------------------------------
 * Tests
 * ------------------------------------------------------------------------- */

describe('DIFFERENTIAL: src/workers emit exactly what lib/workerQueue emits', () => {
    for (const scenario of SCENARIOS) {
        it(scenario.name, async () => {
            const { legacy, modern } = await differential(scenario);
            results.set(scenario.name, legacy);
            if (process.env.DIFF_DEBUG) {
                const line = (e) => `${e.step} ${e.job || 'action'} ${e.event || ''} ${e.room || ''}`;
                // eslint-disable-next-line no-console
                console.log(`--- ${scenario.name}\n` + legacy.emissions.map((e, i) => `${line(e).padEnd(70)} | ${modern.emissions[i] ? line(modern.emissions[i]) : '-'}`).join('\n'));
            }

            expect(modern.emissions).toEqual(legacy.emissions);
            for (let i = 0; i < legacy.states.length; i++) {
                expect({ step: modern.states[i].step, audit: modern.states[i].audit }).toEqual({ step: legacy.states[i].step, audit: legacy.states[i].audit });
                expect({ step: modern.states[i].step, tables: modern.states[i].tables }).toEqual({ step: legacy.states[i].step, tables: legacy.states[i].tables });
            }

            const emitted = legacy.emissions.filter((e) => e.event);
            const rejected = legacy.emissions.filter((e) => e.rejected || (e.action && !e.outcome.ok));
            expect(rejected).toHaveLength(scenario.expect?.rejections ?? 0);
            if (scenario.expect?.emissions !== undefined) expect(emitted).toHaveLength(scenario.expect.emissions);
            for (const [event, n] of Object.entries(scenario.expect?.events || {})) {
                expect(emitted.filter((e) => e.event === event)).toHaveLength(n);
            }
        }, 60000);
    }

    // What the scenarios above are about, asserted on the (shared) legacy record, so a
    // scenario that silently stopped exercising its subject fails here.
    it('the scenarios exercise what they claim', () => {
        const at   = (name) => results.get(name).emissions.filter((e) => e.event);
        const secs = (list) => list.map((e) => Number(e.step.split('@')[1]));

        // ~1 s cadence on a 250 ms tick.
        expect(secs(at('round in progress: match.update about once a second on a 250 ms tick'))).toEqual([0, 1000, 2000, 3000]);

        // break_remaining counts down, then break.ended carries the new round and no break.
        const brk = at('a break counting down, then expiring and starting the next round');
        expect(brk.filter((e) => e.event === 'match.update' && e.payload.break_remaining !== null).map((e) => e.payload.break_remaining))
            .toEqual([55, 54, 53, 1]);
        const ended = brk.find((e) => e.event === 'break.ended');
        expect(ended.payload.break_remaining).toBeNull();
        expect(ended.payload.rounds).toHaveLength(2);
        expect(ended.payload.rounds[1].ended_at).toBeNull();

        // tech fall: rounds only, no mat / judges.
        const tf = at('tech fall in round 1 (round.tech-fall, then a break)').find((e) => e.event === 'round.tech-fall');
        expect(Object.keys(tf.payload)).not.toContain('mat');
        expect(Object.keys(tf.payload)).not.toContain('judges');
        expect(tf.payload.break_remaining).toBe(60);

        // the final round: exactly one match.update after the match left the active set, then silence.
        for (const name of ['tech fall in the final round ends the match (one final match.update)',
                            'round timer expiry in the final round ends the match (one final match.update, then silence)']) {
            const list = at(name);
            const endIdx = list.findIndex((e) => e.payload.ended_at !== null);
            const finals = list.slice(endIdx).filter((e) => e.job === 'matchUpdate');
            expect(finals).toHaveLength(1);
            expect(finals[0].payload.ended_at).not.toBeNull();
            expect(Object.keys(finals[0].payload)).toEqual(expect.arrayContaining(['mat', 'judges', 'rounds']));
            expect(list.slice(endIdx).every((e) => e.payload.ended_at !== null)).toBe(true);
        }

        // the combined run: one match ends (timer3) and one starts (starter) in the same tick.
        const all = at('all at once: concurrent matches, a match ending and one starting in the same tick, a master-ended match');
        const rooms = new Set(all.map((e) => e.room));
        expect(rooms.size).toBe(Object.keys(M).length);
        const tick2 = all.filter((e) => e.step.endsWith('@2000'));
        expect(tick2.some((e) => e.room === `match:${M.timer3}` && e.job === 'matchUpdate' && e.payload.ended_at)).toBe(true);
        expect(tick2.some((e) => e.room === `match:${M.starter}` && e.job === 'matchUpdate' && e.payload.started_at)).toBe(true);
        // the master-ended match: a final update with the stale break still on it.
        const ender = all.filter((e) => e.room === `match:${M.ender}` && e.payload.ended_at);
        expect(ender).toHaveLength(1);
        expect(ender[0].payload.break_remaining).toBe(60);
    });

    it('a tick runs far fewer statements on the new side (reported; new <= legacy for every job)', () => {
        const ofScenario = (side) => statements[side].filter((s) => s.scenario.startsWith('all at once: concurrent'));
        const sum = (side, job) => ofScenario(side).filter((s) => s.job === job).reduce((a, s) => a + s.n, 0);
        const oneTick = (side, job, at) => ofScenario(side).find((s) => s.job === job && s.at === at).n;
        const report = { total: {}, tickAt5s: {}, quietTickAt5250ms: {} };
        for (const job of ALL) {
            report.total[job]    = { legacy: sum('legacy', job), modern: sum('modern', job) };
            report.tickAt5s[job] = { legacy: oneTick('legacy', job, 5000), modern: oneTick('modern', job, 5000) };
        }
        report.quietTickAt5250ms.matchUpdate = { legacy: oneTick('legacy', 'matchUpdate', 5250), modern: oneTick('modern', 'matchUpdate', 5250) };
        // eslint-disable-next-line no-console
        console.log('[statements, "all at once" scenario]', JSON.stringify(report));
        for (const job of ALL) expect(report.total[job].modern).toBeLessThanOrEqual(report.total[job].legacy);
    });
});
