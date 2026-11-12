import { afterAll, beforeAll, describe, expect, it, setSystemTime } from 'bun:test';
/**
 * The lifecycle commands (src/services) against the `lifecycle` snapshot
 * fixture: for every scenario in ./lifecycleScenarios.ts, the outcome, the
 * ordered write log and the row changes must equal the recorded ones exactly
 * (see test/fixtures/frozen/README.md). The scenarios run on an in-memory
 * database seeded with the contract seed, which must itself equal the `seed`
 * fixture. Scenario-specific assertions below say what each scenario is about.
 */
import * as H from './support';
import * as D from '../support/rowDelta';
import * as F from '../support/frozen';
import * as LS from './lifecycleScenarios';
import * as Matches from '../../src/db/repositories/matches';
import * as Rounds from '../../src/db/repositories/rounds';
import * as Votes from '../../src/db/repositories/votes';
import * as MatchSvc from '../../src/services/matchLifecycle';
import * as RoundSvc from '../../src/services/roundLifecycle';
import * as VoteSvc from '../../src/services/ridingTimeVotes';

const { C } = LS;

let IDS;
let NOW;
let db;
let snap;
let labels;
let built;
let fixture;
let seedFixture;
let steps;

beforeAll(async () => {
    const seedModule = require('../contract/seed.ts');
    IDS = seedModule.IDS;
    NOW = seedModule.NOW;
    db = H.modernDb();
    await seedModule.seed({ set: (ms) => setSystemTime(new Date(ms)) }, db);
    setSystemTime();
    snap = H.snapshot(db.$client);
    labels = D.seedLabels(D.dumpRows(db.$client), new Set(Object.values(IDS)));
    built = LS.buildScenarios(seedModule);
    fixture = F.readFixture('lifecycle');
    seedFixture = F.readFixture('seed');
    steps = LS.modernSteps(db);
}, 30000);

afterAll(() => {
    setSystemTime();
    if (db) db.$client.close();
});


/* ---------------------------------------------------------------------------
 * Harness
 * ------------------------------------------------------------------------- */

/**
 * Runs scenario `key` and requires its record to equal the fixture's.
 * Returns the outcome and the end state (tables + write log, ids labelled).
 */
async function frozen(key) {
    const scenario = built.scenarios[key];
    expect(scenario).toBeDefined();
    const { record, outcome, after } = await LS.runScenario({ client: db.$client, snapshot: snap, labels, stepsImpl: steps }, scenario);
    expect(F.asStored(record)).toEqual(fixture.records.get(key));
    const tables = Object.fromEntries(Object.entries(after).map(([t, rows]) => [t, rows.map(({ __rowid, ...row }) => row)]));
    const audit = record.writes.map(([tbl, op, row]) => ({ tbl, op, row }));
    return { outcome, state: { tables, audit } };
}

const rowOf   = (state, table, id) => state.tables[table].find((r) => r.id === id);
const rowsOf  = (state, table, pred) => state.tables[table].filter(pred);
const writes  = (state) => state.audit.map((e) => `${e.op} ${e.tbl}`);
const fails   = (message) => ({ ok: false, error: 'Error', message });


/* ---------------------------------------------------------------------------
 * Scenarios
 * ------------------------------------------------------------------------- */

describe('lifecycle snapshot: harness', () => {
    it('the fixture holds exactly the scenarios defined, each with an outcome and a write log', () => {
        expect([...fixture.records.keys()].sort()).toEqual(Object.keys(built.scenarios).sort());
        expect(fixture.records.size).toBeGreaterThanOrEqual(69);
        for (const record of fixture.records.values()) {
            expect({ key: record.key, outcome: typeof record.outcome, writes: Array.isArray(record.writes), changes: typeof record.changes })
                .toEqual({ key: record.key, outcome: 'object', writes: true, changes: 'object' });
        }
    });

    it('the seed equals the `seed` fixture, is non-trivial, and the audit triggers record writes', async () => {
        H.restore(db.$client, snap);
        const rows = D.dumpRows(db.$client);
        const records: any[] = [];
        for (const t of H.TABLES) for (const { __rowid, ...row } of rows[t]) records.push({ key: `${t}:${__rowid}`, row: D.relabel(row, labels) });
        expect(records.length).toBe(seedFixture.records.size);
        for (const r of records) expect(F.asStored(r)).toEqual(seedFixture.records.get(r.key));
        expect(snap.matches.length).toBeGreaterThanOrEqual(20);
        expect(snap.rounds.length).toBeGreaterThanOrEqual(15);
        expect(snap.riding_time_votes.length).toBeGreaterThan(0);
        expect(snap.round_pauses.length).toBeGreaterThan(0);
        // a Drizzle-baseline database: no legacy migration bookkeeping table
        expect(db.$client.query("SELECT count(*) AS n FROM sqlite_master WHERE name = 'migration_versions'").get().n).toBe(0);
        const { state } = await frozen('sanity');
        expect(state.audit.length).toBeGreaterThan(0);
    });
});


describe('startMatch', () => {
    it('unstarted match: started_at, mat judges copied, round 1 started', async () => {
        const { state, outcome } = await frozen('startMatch.unstarted');
        expect(outcome).toEqual({ ok: true, value: undefined });
        expect(rowOf(state, 'matches', IDS['match:toStart']).started_at).toBe(new Date(NOW).toISOString());
        expect(rowsOf(state, 'judges_matches', (j) => j.match_id === IDS['match:toStart']).map((j) => j.user_id))
            .toEqual([IDS['user:judgeA'], IDS['user:judgeB']]);
        expect(rowsOf(state, 'rounds', (r) => r.match_id === IDS['match:toStart'])).toHaveLength(1);
        expect(writes(state)).toEqual(['UPDATE matches', 'INSERT judges_matches', 'INSERT judges_matches', 'INSERT rounds']);
    });

    it('already started: throws "This match has already started", writes nothing', async () => {
        const { state, outcome } = await frozen('startMatch.alreadyStarted');
        expect(outcome).toEqual(fails('This match has already started'));
        expect(state.audit).toEqual([]);
    });

    it('setJudges semantics: drops judges not on the mat, keeps existing rows untouched, adds the rest', async () => {
        const { state } = await frozen('startMatch.setJudges');
        const judges = rowsOf(state, 'judges_matches', (j) => j.match_id === C.match);
        expect(judges.map((j) => j.user_id).sort()).toEqual([IDS['user:judgeA'], IDS['user:judgeB']].sort());
        expect(judges.find((j) => j.user_id === IDS['user:judgeA']).created_at).toBe(built.iso(95)); // untouched
        expect(writes(state)).toEqual(['UPDATE matches', 'DELETE judges_matches', 'INSERT judges_matches', 'INSERT rounds']);
    });

    it('mat with no judges: every match judge row is removed', async () => {
        const { state } = await frozen('startMatch.matWithoutJudges');
        expect(rowsOf(state, 'judges_matches', (j) => j.match_id === C.match)).toEqual([]);
    });

    it('NOT atomic: an open round makes startRound throw AFTER started_at and judges were written', async () => {
        const { state, outcome } = await frozen('startMatch.notAtomic');
        expect(outcome).toEqual(fails('Cannot start a new round while there is an active round'));
        expect(rowOf(state, 'matches', C.match).started_at).not.toBeNull();
        expect(writes(state)).toEqual(['UPDATE matches', 'INSERT judges_matches', 'INSERT judges_matches']);
    });
});


describe('endMatch (route: POST /match/:id/end)', () => {
    it('active round 1: the round ends first, then the match ends with NO break (F-25.3)', async () => {
        const { state } = await frozen('endMatch.round1');
        const m = rowOf(state, 'matches', IDS['match:toEnd']);
        expect(m.ended_at).not.toBeNull();
        expect([m.break_started_at, m.break_duration]).toEqual([null, null]);
        expect(rowOf(state, 'rounds', IDS['round:toEnd']).ended_at).not.toBeNull();
        expect(writes(state)).toEqual(['UPDATE rounds', 'UPDATE matches']);
    });

    it('active FINAL round: votes closed, pause resumed, round ended, match ended, no error (F-54)', async () => {
        const { state, outcome } = await frozen('endMatch.finalRound');
        expect(outcome.ok).toBe(true);
        expect(writes(state)).toEqual(['UPDATE riding_time_votes', 'UPDATE riding_time_votes', 'UPDATE round_pauses', 'UPDATE rounds', 'UPDATE matches']);
        expect(rowOf(state, 'matches', C.match).ended_at).not.toBeNull();
    });

    it('in a break with the last round ended: break cleared, endRound({safe:true}) returns silently', async () => {
        const { state, outcome } = await frozen('endMatch.inBreak');
        expect(outcome.ok).toBe(true);
        const m = rowOf(state, 'matches', IDS['match:break']);
        expect([m.break_started_at, m.break_duration]).toEqual([null, null]);
        expect(writes(state)).toEqual(['UPDATE matches']);
    });

    it('started match with no rounds: ended, safe endRound is a no-op', async () => {
        const { state } = await frozen('endMatch.noRounds');
        expect(writes(state)).toEqual(['UPDATE matches']);
    });

    it.each([
        ['match:done',       'This match has already ended'],
        ['match:notStarted', 'This match has already not started'],
    ])('%s: throws "%s", writes nothing', async (key, message) => {
        const { state, outcome } = await frozen(`endMatch.throws:${key}`);
        expect(outcome).toEqual(fails(message));
        expect(state.audit).toEqual([]);
    });
});


describe('startRound (route: POST /match/:id/rounds)', () => {
    it('last round ended (in a break): inserts the next round, leaves the break fields alone', async () => {
        const { state } = await frozen('startRound.afterRoundEnded');
        expect(writes(state)).toEqual(['INSERT rounds']);
        expect(rowOf(state, 'matches', IDS['match:toStartRound']).break_duration).toBe(60);
    });

    it('active round: throws "Cannot start a new round while there is an active round"', async () => {
        const { state, outcome } = await frozen('startRound.activeRound');
        expect(outcome).toEqual(fails('Cannot start a new round while there is an active round'));
        expect(state.audit).toEqual([]);
    });

    it.each([
        ['match:notStarted', 'Cannot start a round on a match that has not started'],
        ['match:done',       'Cannot start a round on a match that has ended'],
    ])('%s: refused with "%s", nothing written (F-56)', async (key, message) => {
        const { state, outcome } = await frozen(`startRound.refused:${key}`);
        expect(outcome).toEqual(fails(message));
        expect(state.audit).toEqual([]);
    });
});


describe('endRound + finishRound (route: POST /match/:id/rounds/end)', () => {
    it('mid-match round 1, no votes: round ended, 60s break started, match NOT ended', async () => {
        const { state } = await frozen('endRound.round1');
        const m = rowOf(state, 'matches', IDS['match:toEndRound']);
        expect([m.ended_at, m.break_duration, m.break_started_at]).toEqual([null, 60, new Date(NOW).toISOString()]);
        expect(writes(state)).toEqual(['UPDATE rounds', 'UPDATE matches']);
    });

    it('open votes are closed first (vote close on end), then the round, then the break', async () => {
        const { state } = await frozen('endRound.openVotes');
        expect(rowsOf(state, 'riding_time_votes', (v) => v.round_id === IDS['round:open']).every((v) => v.ended_at !== null)).toBe(true);
        expect(writes(state)).toEqual(['UPDATE riding_time_votes', 'UPDATE riding_time_votes', 'UPDATE rounds', 'UPDATE matches']);
    });

    it('open pause is resumed before the round ends', async () => {
        const { state } = await frozen('endRound.openPause');
        expect(rowOf(state, 'round_pauses', IDS['pause:paused-open']).resumed_at).toBe(new Date(NOW).toISOString());
        expect(writes(state)).toEqual(['UPDATE round_pauses', 'UPDATE rounds', 'UPDATE matches']);
    });

    it('FINAL round: votes closed -> pause resumed -> round ended -> match ended -> endRound({safe:true}) returns silently', async () => {
        const { state, outcome } = await frozen('endRound.finalRound');
        expect(outcome).toEqual({ ok: true, value: undefined });
        const m = rowOf(state, 'matches', C.match);
        expect(m.ended_at).toBe(new Date(NOW).toISOString());
        expect([m.break_started_at, m.break_duration]).toEqual([null, null]);
        expect(writes(state)).toEqual(['UPDATE riding_time_votes', 'UPDATE riding_time_votes', 'UPDATE round_pauses', 'UPDATE rounds', 'UPDATE matches']);
    });

    it('NO EARLY EXIT: red wins round 2 for a 2-0 lead, the match goes to a break, it does not end', async () => {
        const { state } = await frozen('endRound.noEarlyExit');
        const m = rowOf(state, 'matches', C.match);
        expect(m.ended_at).toBeNull();
        expect(m.break_duration).toBe(60);
    });

    it('4th round (round added to an ended match): no end, no break (getBreakDuration(4) = 0)', async () => {
        const { state } = await frozen('endRound.fourthRound');
        expect(writes(state)).toEqual(['UPDATE rounds']);
    });

    it('never-started match with a 3rd round open: the round ends, then endMatch throws "has already not started"', async () => {
        const { outcome, state } = await frozen('endRound.neverStarted');
        expect(outcome).toEqual(fails('This match has already not started'));
        expect(rowOf(state, 'rounds', C.r3).ended_at).not.toBeNull();
    });

    it('several open votes (incl. two by one judge) are all closed, in insertion order', async () => {
        const { state } = await frozen('endRound.severalOpenVotes');
        expect(state.audit.filter((e) => e.tbl === 'riding_time_votes').map((e) => e.row.id)).toEqual([C.v1, C.v2, C.v3]);
    });

    it('two open pauses: only the LAST one is resumed, the earlier stays open after the round ends', async () => {
        const { state } = await frozen('endRound.twoOpenPauses');
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
        const i = built.NO_ROUND_CASES.findIndex(([k, o]) => k === key && JSON.stringify(o) === JSON.stringify(opts));
        const { state, outcome } = await frozen(`endRound.noRound:${i}`);
        expect(outcome).toEqual(message ? fails(message) : { ok: true, value: undefined });
        expect(state.audit).toEqual([]);
    });
});


describe('worker-driven paths (the query each job runs, then the command it calls)', () => {
    it('TechFallTracker: an open round over the threshold is ended via endRound() (no safe)', async () => {
        const { state } = await frozen('worker.techFall');
        expect(rowOf(state, 'rounds', IDS['round:wsTechFall']).ended_at).not.toBeNull();
        expect(rowOf(state, 'matches', IDS['match:wsTechFall']).break_duration).toBe(60);
    });

    it('RoundTimer: an expired round 1 is ended', async () => {
        const { state } = await frozen('worker.roundTimer.round1');
        expect(rowOf(state, 'rounds', IDS['round:toEndRound']).ended_at).toBe(built.iso(720));
    });

    it('RoundTimer: an expired FINAL round ends the match', async () => {
        const { state } = await frozen('worker.roundTimer.finalRound');
        expect(rowOf(state, 'matches', C.match).ended_at).not.toBeNull();
    });

    it('BreakTransition: expired break -> break cleared, next round started', async () => {
        const { state } = await frozen('worker.breakTransition');
        expect(writes(state)).toEqual(['UPDATE matches', 'INSERT rounds']);
    });

    it('race: a second worker endRound() on the just-ended round throws "No available round to end"', async () => {
        const { outcome } = await frozen('worker.race');
        expect(outcome).toEqual(fails('No available round to end'));
    });
});


describe('pauseRound / resumeRound', () => {
    it('pause an active round', async () => {
        const { state } = await frozen('pause.activeRound');
        expect(writes(state)).toEqual(['INSERT round_pauses']);
    });

    it('pause leaves open riding-time votes open', async () => {
        const { state } = await frozen('pause.withOpenVotes');
        expect(writes(state)).toEqual(['INSERT round_pauses']);
        expect(rowsOf(state, 'riding_time_votes', (v) => v.round_id === IDS['round:open']).map((v) => v.ended_at)).toEqual([null, null]);
    });

    it.each([
        ['match:paused', 'Round is already paused'],
        ['match:break',  'Round has already ended'],
    ])('pause %s: throws "%s"', async (key, message) => {
        const { outcome, state } = await frozen(`pause.throws:${key}`);
        expect(outcome).toEqual(fails(message));
        expect(state.audit).toEqual([]);
    });

    it('resume a paused round', async () => {
        const { state } = await frozen('resume.paused');
        expect(writes(state)).toEqual(['UPDATE round_pauses']);
    });

    it('resume a round that is not paused: throws "Round is not paused"', async () => {
        const { outcome } = await frozen('resume.notPaused');
        expect(outcome).toEqual(fails('Round is not paused'));
    });

    it('resume closes the LAST open pause', async () => {
        const { state } = await frozen('resume.lastOpenPause');
        expect(state.audit.map((e) => e.row.id)).toEqual([C.p2]);
    });

    it('pause, resume, pause again on the same round', async () => {
        const { state } = await frozen('pause.resume.pause');
        expect(writes(state)).toEqual(['INSERT round_pauses', 'UPDATE round_pauses', 'INSERT round_pauses']);
    });
});


describe('setRoundResult (route: PATCH /match/:id/rounds/result)', () => {
    // The route always passes BOTH keys: { winner, stoppage }.
    it.each([
        ['match:toSubmission',  'red',   false],
        ['match:toSubmission',  'red',   undefined],
        ['match:toStoppage',    'blue',  true],
        ['match:toSubmission',  'RED',   true],
        ['match:toClearResult', undefined, undefined],
        ['match:toClearResult', null,    true],
        ['match:done',          'blue',  false],
    ])('%s winner=%p stoppage=%p', async (key, winner, stoppage) => {
        const i = built.RESULT_WRITES.findIndex(([k, w, s]) => k === key && w === winner && s === stoppage);
        const { state } = await frozen(`setResult.write:${i}`);
        expect(writes(state)).toEqual(['UPDATE rounds']);
    });

    it.each(noOpLabels())('no-op saves: %s', async (label) => {
        const i = built.RESULT_NOOPS.findIndex(([l]) => l === label);
        await frozen(`setResult.noop:${i}`);
    });

    it('a round that has not ended: throws "Cannot set result on a round that has not ended"', async () => {
        const { outcome } = await frozen('setResult.notEnded');
        expect(outcome).toEqual(fails('Cannot set result on a round that has not ended'));
    });

    it('unknown colour: a TypeError from the dynamic competitor lookup', async () => {
        const { outcome } = await frozen('setResult.unknownColour');
        expect(outcome.error).toBe('TypeError');
    });

    it('winner whose competitor row is missing: declared_winner_id left unchanged (competitor?.id is undefined), stoppage written', async () => {
        const { state } = await frozen('setResult.missingCompetitor');
        expect(rowOf(state, 'rounds', C.r1).declared_winner_id).toBe(IDS['user:blue']);
        expect(rowOf(state, 'rounds', C.r1).stoppage).toBe(0);
    });

    // The route does not validate `stoppage`; the boolean column stores any
    // truthy value as 1.
    it('a non-boolean stoppage is stored as 1', async () => {
        H.restore(db.$client, snap);
        setSystemTime(new Date(NOW));
        try {
            await RoundSvc.setRoundResult(db, (await Rounds.findLastRound(db, IDS['match:toStoppage']))!, { winner: 'blue', stoppage: 'yes' as unknown as boolean });
        } finally {
            setSystemTime();
        }
        const q = 'SELECT declared_winner_id, stoppage FROM rounds WHERE id = ?';
        expect(db.$client.query(q).get(IDS['round:toStoppage'])).toEqual({ declared_winner_id: IDS['user:blue'], stoppage: 1 });
    });
});


describe('startRidingTime / endRidingTime / endVote', () => {
    it('start a vote', async () => {
        const { state } = await frozen('vote.start');
        expect(state.audit.map((e) => [e.op, e.row.competitor_id, e.row.judge_id])).toEqual([['INSERT', IDS['user:red'], IDS['user:judgeA']]]);
    });

    it('start while the judge already has an open vote: "Riding time is already active"', async () => {
        const { outcome } = await frozen('vote.alreadyActive');
        expect(outcome).toEqual(fails('Riding time is already active'));
    });

    it('end the open vote', async () => {
        const { state } = await frozen('vote.end');
        expect(writes(state)).toEqual(['UPDATE riding_time_votes']);
    });

    it('end ignores the rider colour: a red vote is ended by a "blue" end', async () => {
        const { state } = await frozen('vote.endIgnoresRider');
        expect(state.audit.map((e) => e.row.id)).toEqual([C.v1]);
    });

    it('end with no open vote: "Riding time is not active"', async () => {
        const { outcome } = await frozen('vote.endWithoutOpenVote');
        expect(outcome).toEqual(fails('Riding time is not active'));
    });

    it('start, end, start again', async () => {
        const { state } = await frozen('vote.startEndStart');
        expect(writes(state)).toEqual(['INSERT riding_time_votes', 'UPDATE riding_time_votes', 'INSERT riding_time_votes']);
    });

    it.each([['green'], [undefined]])('rider %p: a TypeError from the dynamic competitor lookup', async (rider) => {
        const { outcome, state } = await frozen(`vote.badRider:${rider}`);
        expect(outcome.error).toBe('TypeError');
        expect(state.audit).toEqual([]);
    });

    it('missing competitor row: TypeError on competitor.id, nothing written', async () => {
        const { outcome, state } = await frozen('vote.missingCompetitor');
        expect(outcome.error).toBe('TypeError');
        expect(state.audit).toEqual([]);
    });

    it('endVote (a judge leaving a mat mid-round)', async () => {
        const { state } = await frozen('vote.endVote');
        expect(writes(state)).toEqual(['UPDATE riding_time_votes']);
    });
});


describe('ONE implementation, two callers: route-style and worker-style calls of the same service give identical state', () => {
    async function stateAfter(fn, when = NOW) {
        H.restore(db.$client, snap);
        const known = H.idsIn(db.$client);
        setSystemTime(new Date(when));
        let outcome;
        try { outcome = await H.settle(fn); } finally { setSystemTime(); }
        return { outcome, state: H.normalize(H.dump(db.$client), known) };
    }

    it('endRound: route (findMatchById + {safe:false}) == worker (findOpenRounds -> match -> no options)', async () => {
        const key = 'match:open';
        const route  = await stateAfter(async () => { const match = await Matches.findMatchById(db, IDS[key]); await MatchSvc.endRound(db, match!.id, { safe: false }); });
        const worker = await stateAfter(async () => {
            const round = (await Rounds.findOpenRounds(db)).find((r) => r.match_id === IDS[key]);
            const match = await Matches.findMatchById(db, round!.match_id);
            await MatchSvc.endRound(db, match!.id);
        });
        expect(route.outcome).toEqual({ ok: true, value: undefined });
        expect(worker).toEqual(route);
        expect(route.state.audit.length).toBe(4);
    });

    it('startRound: route (findMatchById) == worker (findMatchesInBreak)', async () => {
        const key = 'match:toStartRound';
        const route  = await stateAfter(async () => { await MatchSvc.startRound(db, (await Matches.findMatchById(db, IDS[key]))!.id); });
        const worker = await stateAfter(async () => { await MatchSvc.startRound(db, (await Matches.findMatchesInBreak(db)).find((m) => m.id === IDS[key])!.id); });
        expect(worker).toEqual(route);
        expect(route.state.generated).toBe(1);
    });

    it('endVote: ridingTime route (endRidingTime) == mat leave route (findOpenVoteForJudge + endVote)', async () => {
        const judgeId = IDS['user:judgeA'];
        const viaRidingTime = await stateAfter(async () => { await VoteSvc.endRidingTime(db, (await Rounds.findLastRound(db, IDS['match:soloJudge']))!, judgeId, 'red'); });
        const viaLeave      = await stateAfter(async () => { await VoteSvc.endVote(db, (await Votes.findOpenVoteForJudge(db, IDS['round:soloJudge'], judgeId))!); });
        expect(viaLeave).toEqual(viaRidingTime);
        expect(viaRidingTime.state.audit).toHaveLength(1);
    });
});

/** The no-op labels, known before `beforeAll` runs (the table is static). */
function noOpLabels() {
    return [
        ['clear an already-empty result'],
        ['clear twice'],
        ['same winner, stoppage null, twice'],
        ['same winner and stoppage true, twice'],
        ['same winner and stoppage false, twice'],
    ];
}
