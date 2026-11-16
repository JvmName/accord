/**
 * The worker timelines behind test/workers/emissionDifferential.test.ts and
 * the `emissions` snapshot fixture. Not a test file.
 *
 * Each scenario loads its matches, then walks a list of steps with the clock
 * frozen at each one. A step runs the HTTP-like actions due at that instant,
 * then the given jobs, in order, on persistent worker instances (the
 * match-update job's throttle and active-set memory carry across steps).
 *
 * The record of a scenario: every emission, grouped by room, as
 * [step, job, event, payload index] with each distinct payload stored once;
 * the outcome of every action and every rejected job; and after every step
 * the new writes (grouped by match, see `byMatch`) and the row changes.
 */
import { setSystemTime } from 'bun:test';
import * as H from '../services/support';
import * as D from '../support/rowDelta';
import { canonical } from '../support/frozen';

const T0  = Date.parse('2026-03-01T12:00:00.000Z');
const iso = (s) => new Date(T0 + s * 1000).toISOString();
const X   = (suffix) => `00000000-0000-4000-9000-${String(suffix).padStart(12, '0')}`;
const stamps = (s) => ({ created_at: iso(s), updated_at: iso(s) });

const U: Record<string, string> = { creator: X('c0'), judgeA: X('c1'), judgeB: X('c2') };
for (let k = 1; k <= 9; k++) { U[`red${k}`] = X(`d${k}0`); U[`blue${k}`] = X(`d${k}1`); }
const MAT = X('a0');

/** Users, the mat and its two judges: present in every scenario. */
function insertBase(client) {
    const users = Object.entries(U).map(([name, id], i) => ({ id, name, api_token: X(`7${i}`), ...stamps(-1000) }));
    H.insertRaw(client, 'users', users);
    H.insertRaw(client, 'mats', [{ id: MAT, name: 'mat', judge_count: 2, creator_id: U.creator, ...stamps(-1000) }]);
    H.insertRaw(client, 'judges_mats', [U.judgeA, U.judgeB].map((user_id) => ({ mat_id: MAT, user_id, ...stamps(-1000) })));
}

function fixtures() {
    const rows: any[] = [];
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

const ALL = ['techFall', 'breakTransition', 'roundTimer', 'matchUpdate'];
const MU  = ['matchUpdate'];

/** Steps every 250 ms from `from` to `to` (ms): the match-update job on each, every job on whole seconds. */
function ticks(from, to, order = ALL) {
    const steps: any[] = [];
    for (let at = from; at <= to; at += 250) steps.push({ at, jobs: at % 1000 === 0 ? order : MU });
    return steps;
}

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

const act = (action, match) => ({ action, match });

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
        steps: ticks(0, 4000).map((s) => ({ ...s, actions: s.at === 750 ? [act('pause', M.paused)] : s.at === 2500 ? [act('resume', M.paused)] : [] })),
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
                ...(s.at === 750  ? [act('pause', M.paused)] : []),
                ...(s.at === 1000 ? [act('endMatch', M.ender)] : []),
                // timer3 ends in this same tick.
                ...(s.at === 2000 ? [act('startMatch', M.starter)] : []),
                ...(s.at === 2500 ? [act('resume', M.paused)] : []),
            ],
        })),
    },
    {
        name: 'all at once, with the match-update job running FIRST on whole seconds',
        build: ALL_AT_ONCE,
        steps: [...ticks(0, 6000, ['matchUpdate', 'roundTimer', 'breakTransition', 'techFall']), ...ticks(54000, 56000)].map((s) => ({
            ...s,
            actions: [
                ...(s.at === 1000 ? [act('endMatch', M.ender)] : []),
                ...(s.at === 2000 ? [act('startMatch', M.starter)] : []),
            ],
        })),
    },
];

/** The HTTP-like actions as the current routes perform them. */
function modernActions(db) {
    /* eslint-disable global-require */
    const MatchSvc = require('../../src/services/matchLifecycle');
    const RoundSvc = require('../../src/services/roundLifecycle');
    const Matches  = require('../../src/db/repositories/matches');
    const Rounds   = require('../../src/db/repositories/rounds');
    /* eslint-enable global-require */
    return {
        pause:      async (id) => RoundSvc.pauseRound(db, await Rounds.findLastRound(db, id)),
        resume:     async (id) => RoundSvc.resumeRound(db, await Rounds.findLastRound(db, id)),
        startMatch: async (id) => MatchSvc.startMatch(db, await Matches.findMatchById(db, id)),
        endMatch:   async (id) => MatchSvc.endMatch(db, await Matches.findMatchById(db, id)),
    };
}

function modernWorkers(db) {
    const Modern = require('../../src/workers'); // eslint-disable-line global-require
    const make = (Cls) => new Cls('differential-worker', { db });
    return {
        techFall:        make(Modern.TechFallTrackerWorker),
        breakTransition: make(Modern.BreakTransitionWorker),
        roundTimer:      make(Modern.RoundTimerWorker),
        matchUpdate:     make(Modern.MatchUpdateWorker),
    };
}

/** The match a write belongs to. */
function ownerOf(roundToMatch, { tbl, row }) {
    if (tbl === 'matches') return row.id;
    if (tbl === 'rounds' || tbl === 'judges_matches') return row.match_id;
    if (tbl === 'riding_time_votes' || tbl === 'round_pauses') return roundToMatch.get(row.round_id) || '';
    return '';
}

/**
 * The writes of one step, grouped by the match each belongs to (stable within
 * a match). Jobs that handle several matches at once may interleave the
 * writes of different matches in any order; the order for one match is exact.
 */
function byMatch(audit, rows) {
    const roundToMatch = new Map(rows.rounds.map((r) => [r.id, r.match_id]));
    return audit
        .map((entry, index) => ({ entry, index, owner: ownerOf(roundToMatch, entry) }))
        .sort((a, b) => a.owner.localeCompare(b.owner) || a.index - b.index)
        .map((x) => x.entry);
}

/**
 * Within one job run, emissions for DIFFERENT rooms may come out in any order
 * (jobs may render matches concurrently). No client can observe that order,
 * since each room is its own stream, so each (step, job) group is sorted by
 * room, stably: the order within a room, and of steps and jobs, is exact.
 */
function canonicalEmissions(emissions) {
    const groups = new Map();
    const keyed = emissions.map((e, index) => {
        const group = `${e.step}|${e.job || 'action'}`;
        if (!groups.has(group)) groups.set(group, groups.size);
        return { e, index, group: groups.get(group) };
    });
    keyed.sort((a, b) => a.group - b.group || String(a.e.room || '').localeCompare(String(b.e.room || '')) || a.index - b.index);
    return keyed.map((k) => k.e);
}

/** Labels for ids created during the scenario, shared by emissions and rows. */
function generatedLabels(known) {
    const labels = new Map();
    const label = (id) => {
        if (!labels.has(id)) labels.set(id, `<gen:${labels.size}>`);
        return labels.get(id);
    };
    const walk = (value) => {
        if (typeof value === 'string') return D.UUID_RE.test(value) && !known.has(value) ? label(value) : value;
        if (Array.isArray(value)) return value.map(walk);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [walk(k), walk(v)]));
        return value;
    };
    return { labels, walk };
}

/**
 * Runs `scenario` with one side's `workers` / `actions` on `client` (raw
 * handle, audit triggers installed, already holding the scenario's rows).
 * `onPayload(event, payload)` sees every emission before it is recorded.
 */
async function runTimeline({ client, workers, actions, onPayload }: { client: any; workers: Record<string, any>; actions: any; onPayload: any }, scenario) {
    const emissions: any[] = [];
    const steps: any[] = [];
    let step = '';
    for (const name of Object.keys(workers)) {
        workers[name].notifyServer = (event, payload) => {
            if (onPayload) onPayload(event, payload);
            emissions.push({ step, job: name, event, room: `match:${payload.id}`, payload: JSON.parse(JSON.stringify(payload)) });
        };
    }
    let seq = D.lastAuditSeq(client);
    let rows = D.dumpRows(client);
    try {
        for (const [i, s] of scenario.steps.entries()) {
            setSystemTime(new Date(T0 + s.at));
            step = i;
            for (const action of s.actions || []) {
                emissions.push({ step, action: true, outcome: await H.settle(() => actions[action.action](action.match)) });
            }
            for (const job of s.jobs) {
                const outcome = await H.settle(() => workers[job].performJob());
                if (!outcome.ok) emissions.push({ step, job, rejected: outcome });
            }
            const audit = D.readAudit(client, seq);
            seq = D.lastAuditSeq(client);
            const next = D.dumpRows(client);
            steps.push({ step: i, audit: byMatch(audit, next), before: rows, after: next });
            rows = next;
        }
    } finally {
        setSystemTime();
        for (const w of Object.values(workers)) if (typeof w.close === 'function') w.close();
    }
    return { emissions: canonicalEmissions(emissions), steps };
}

/**
 * The compact records of a timeline (`known` is every id present before it
 * ran): a summary keyed by the scenario name, then one record per distinct
 * payload, per room and per step that wrote anything, keyed `<name> | ...`.
 */
function encodeTimeline(name, { emissions, steps }, known) {
    const { labels, walk } = generatedLabels(known);
    const payloads: any[] = [];
    const payloadIndex = new Map();
    const rooms = {};
    const actions: any[] = [];
    const rejections: any[] = [];
    for (const e of walk(emissions)) {
        if (e.action) { actions.push([e.step, e.outcome]); continue; }
        if (e.rejected) { rejections.push([e.step, e.job, e.rejected]); continue; }
        const text = canonical(e.payload);
        if (!payloadIndex.has(text)) { payloadIndex.set(text, payloads.length); payloads.push(e.payload); }
        (rooms[e.room] ||= []).push([e.step, e.job, e.event, payloadIndex.get(text)]);
    }
    const stepRecords: any[] = [];
    for (const s of steps) {
        D.labelGenerated(labels, known, s.audit, s.after);
        const writes  = D.auditEntries(s.audit, labels);
        const changes = D.rowChanges(s.before, s.after, labels);
        if (writes.length || Object.keys(changes).length) stepRecords.push({ key: `${name} | step ${s.step}`, writes, changes });
    }
    return [
        { key: name, payloads: payloads.length, rooms: Object.keys(rooms).sort(), steps: stepRecords.map((r) => r.key), actions, rejections },
        ...payloads.map((payload, i) => ({ key: `${name} | payload ${i}`, payload })),
        ...Object.keys(rooms).sort().map((room) => ({ key: `${name} | ${room}`, emissions: rooms[room] })),
        ...stepRecords,
    ];
}

/** The scenario's emissions in comparison form, rebuilt from its records (for the scenario assertions). */
function emittedFrom(records) {
    const byKey = new Map<string, any>(records.map((r) => [r.key, r]));
    const summary = records[0];
    const list: any[] = [];
    for (const room of summary.rooms) {
        for (const [step, job, event, p] of byKey.get(`${summary.key} | ${room}`).emissions) {
            list.push({ step, job, event, room, payload: byKey.get(`${summary.key} | payload ${p}`).payload });
        }
    }
    return list.sort((a, b) => a.step - b.step);
}

/** Rows of a scenario: the base rows plus its builders' rows, inserted table by table. */
function loadScenario(client, snapshot, scenario) {
    const fx = fixtures();
    for (const key of scenario.build) BUILD[key](fx);
    H.restore(client, snapshot);
    const byTable = new Map();
    for (const [table, row] of fx.rows) {
        if (!byTable.has(table)) byTable.set(table, []);
        byTable.get(table).push(row);
    }
    for (const [table, rows] of byTable) H.insertRaw(client, table, rows);
    return H.idsIn(client);
}

export {
    ALL, M, SCENARIOS, T0, U, canonicalEmissions, emittedFrom, encodeTimeline, insertBase, loadScenario, modernActions, modernWorkers, runTimeline,
};
