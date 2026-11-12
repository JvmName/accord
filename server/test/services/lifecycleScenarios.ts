/**
 * The lifecycle command scenarios behind test/services/lifecycleParity.test.ts
 * and the `lifecycle` snapshot fixture. Not a test file.
 *
 * Every scenario starts from the contract seed (test/contract/seed.ts) plus its
 * own `setup` rows, freezes the clock at `at`, and runs `steps` in order, each
 * the way its real caller does it (a route: load the match, then the command;
 * a worker: the query the job runs, then the command). The first step that
 * throws ends the scenario.
 *
 * The record of a scenario is its outcome, the ordered write log (audit
 * triggers) and the row changes, see ../support/rowDelta.ts.
 */
import { setSystemTime } from 'bun:test';
import * as H from './support';
import * as D from '../support/rowDelta';
import { UNDEFINED } from '../support/frozen';

const X = (suffix) => `00000000-0000-4000-9000-${suffix.padStart(12, '0')}`;

/** Ids of the rows the scenarios add on top of the seed. */
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

/** The scenarios, keyed. `seed` is test/contract/seed.ts (IDS, T0, NOW). */
function buildScenarios({ IDS, T0, NOW }) {
    const at     = (s) => T0 + s * 1000;
    const iso    = (s) => new Date(at(s)).toISOString();
    const stamps = (s) => ({ created_at: iso(s), updated_at: iso(s) });
    const id     = (key) => IDS[key] ?? key;

    function addMatch(add, { matId = IDS['mat:flow'], red = IDS['user:red'], blue = IDS['user:blue'], startedAt = 100 as number | null, endedAt = null as number | null, breakStartedAt = null as number | null, breakDuration = null as number | null, judges = [IDS['user:judgeA'], IDS['user:judgeB']] } = {}) {
        add('matches', [{
            id: C.match, creator_id: IDS['user:creator'], mat_id: matId,
            red_competitor_id: red, blue_competitor_id: blue, red_score: 0, blue_score: 0,
            started_at: startedAt == null ? null : iso(startedAt), ended_at: endedAt == null ? null : iso(endedAt),
            break_started_at: breakStartedAt == null ? null : iso(breakStartedAt), break_duration: breakDuration,
            ...stamps(90),
        }]);
        if (judges.length) add('judges_matches', judges.map((user_id) => ({ match_id: C.match, user_id, ...stamps(95) })));
    }

    function addRound(add, roundId, { start, end = null as number | null, winner = null as string | null, stoppage = null as number | boolean | null }) {
        add('rounds', [{ id: roundId, match_id: C.match, ended_at: end == null ? null : iso(end), ...stamps(start), declared_winner_id: winner, stoppage }]);
    }

    function addVote(add, voteId, { round, judge, competitor, start, end = null as number | null }) {
        add('riding_time_votes', [{ id: voteId, round_id: round, judge_id: judge, competitor_id: competitor, ended_at: end == null ? null : iso(end), ...stamps(start) }]);
    }

    /** Rounds 1-2 ended, round 3 open with open red consensus votes and (unless `pause: false`) an open pause. */
    function finalRoundFixture(add, matchOpts = {}, { pause = true } = {}) {
        addMatch(add, matchOpts);
        addRound(add, C.r1, { start: 100, end: 200 });
        addRound(add, C.r2, { start: 270, end: 390 });
        addRound(add, C.r3, { start: 450 });
        addVote(add, C.v1, { round: C.r3, judge: IDS['user:judgeA'], competitor: IDS['user:red'], start: 460 });
        addVote(add, C.v2, { round: C.r3, judge: IDS['user:judgeB'], competitor: IDS['user:red'], start: 461 });
        if (pause) add('round_pauses', [{ id: C.p1, round_id: C.r3, paused_at: iso(500), resumed_at: null, ...stamps(500) }]);
    }

    /** Red won round 1 by submission; round 2 open with red consensus control. */
    function twoWinsFixture(add) {
        addMatch(add);
        addRound(add, C.r1, { start: 100, end: 200, winner: IDS['user:red'], stoppage: 0 });
        addRound(add, C.r2, { start: 300 });
        addVote(add, C.v1, { round: C.r2, judge: IDS['user:judgeA'], competitor: IDS['user:red'], start: 310 });
        addVote(add, C.v2, { round: C.r2, judge: IDS['user:judgeB'], competitor: IDS['user:red'], start: 310 });
    }

    function twoOpenPauses(add) {
        addMatch(add);
        addRound(add, C.r1, { start: 500 });
        add('round_pauses', [
            { id: C.p1, round_id: C.r1, paused_at: iso(510), resumed_at: null, ...stamps(510) },
            { id: C.p2, round_id: C.r1, paused_at: iso(520), resumed_at: null, ...stamps(520) },
        ]);
    }

    const judge = (k) => IDS[`user:${k}`];
    const S = {};
    const scenario = (key, steps, { setup, when }: { setup?: unknown; when?: number } = {}) => { S[key] = { key, steps, setup, at: when ?? NOW }; };

    scenario('sanity', [{ op: 'start', match: id('match:toStart') }]);

    scenario('startMatch.unstarted', [{ op: 'start', match: id('match:toStart') }]);
    scenario('startMatch.alreadyStarted', [{ op: 'start', match: id('match:open') }]);
    scenario('startMatch.setJudges', [{ op: 'start', match: C.match }],
        { setup: (add) => addMatch(add, { startedAt: null, judges: [IDS['user:outsider'], IDS['user:judgeA']] }) });
    scenario('startMatch.matWithoutJudges', [{ op: 'start', match: C.match }],
        { setup: (add) => addMatch(add, { matId: IDS['mat:empty'], startedAt: null, judges: [IDS['user:judgeA']] }) });
    scenario('startMatch.notAtomic', [{ op: 'start', match: C.match }],
        { setup: (add) => { addMatch(add, { startedAt: null, judges: [] }); addRound(add, C.r1, { start: 95 }); } });

    scenario('endMatch.round1', [{ op: 'end', match: id('match:toEnd') }]);
    scenario('endMatch.finalRound', [{ op: 'end', match: C.match }], { setup: (add) => finalRoundFixture(add) });
    scenario('endMatch.inBreak', [{ op: 'end', match: id('match:break') }]);
    scenario('endMatch.noRounds', [{ op: 'end', match: id('match:breakNoRounds') }]);
    for (const key of ['match:done', 'match:notStarted']) scenario(`endMatch.throws:${key}`, [{ op: 'end', match: id(key) }]);

    scenario('startRound.afterRoundEnded', [{ op: 'startRound', match: id('match:toStartRound') }]);
    scenario('startRound.activeRound', [{ op: 'startRound', match: id('match:open') }]);
    for (const key of ['match:notStarted', 'match:done']) scenario(`startRound.refused:${key}`, [{ op: 'startRound', match: id(key) }]);

    const endRound = (match, opts) => [{ op: 'endRound', match: id(match), opts }];
    scenario('endRound.round1', endRound('match:toEndRound', { safe: false }));
    scenario('endRound.openVotes', endRound('match:open', { safe: false }));
    scenario('endRound.openPause', endRound('match:paused', { safe: false }));
    scenario('endRound.finalRound', endRound(C.match, { safe: false }), { setup: (add) => finalRoundFixture(add) });
    scenario('endRound.noEarlyExit', endRound(C.match, { safe: false }), { setup: (add) => twoWinsFixture(add) });
    scenario('endRound.fourthRound', endRound('match:done', { safe: false }), {
        setup: (add) => add('rounds', [{ id: C.r1, match_id: IDS['match:done'], ended_at: null, ...stamps(590), declared_winner_id: null, stoppage: null }]),
    });
    scenario('endRound.neverStarted', endRound(C.match, { safe: false }), { setup: (add) => finalRoundFixture(add, { startedAt: null }) });
    scenario('endRound.severalOpenVotes', endRound(C.match, { safe: false }), {
        setup: (add) => {
            addMatch(add);
            addRound(add, C.r1, { start: 500 });
            addVote(add, C.v0, { round: C.r1, judge: IDS['user:judgeA'], competitor: IDS['user:red'],  start: 505, end: 510 });
            addVote(add, C.v1, { round: C.r1, judge: IDS['user:judgeA'], competitor: IDS['user:red'],  start: 520 });
            addVote(add, C.v2, { round: C.r1, judge: IDS['user:judgeA'], competitor: IDS['user:blue'], start: 521 });
            addVote(add, C.v3, { round: C.r1, judge: IDS['user:judgeB'], competitor: IDS['user:red'],  start: 522 });
        },
    });
    scenario('endRound.twoOpenPauses', endRound(C.match, { safe: false }), { setup: twoOpenPauses });
    const NO_ROUND_CASES = [
        ['match:break',      { safe: false }],
        ['match:break',      undefined],
        ['match:break',      { safe: true }],
        ['match:notStarted', { safe: false }],
        ['match:notStarted', { safe: true }],
        ['match:notStarted', {}],
    ];
    NO_ROUND_CASES.forEach(([key, opts], i) => scenario(`endRound.noRound:${i}`, endRound(key, opts)));

    scenario('worker.techFall', [{ op: 'workerTechFall', round: IDS['round:wsTechFall'] }]);
    scenario('worker.roundTimer.round1', [{ op: 'workerRoundTimer', round: IDS['round:toEndRound'] }], { when: at(540 + 180) });
    scenario('worker.roundTimer.finalRound', [{ op: 'workerRoundTimer', round: C.r3 }], { setup: (add) => finalRoundFixture(add, {}, { pause: false }) });
    scenario('worker.breakTransition', [{ op: 'workerBreakTransition', match: IDS['match:wsBreakEnded'] }]);
    scenario('worker.race', [...endRound('match:toEndRound', undefined), ...endRound('match:toEndRound', undefined)]);

    scenario('pause.activeRound', [{ op: 'pause', match: id('match:toPause') }]);
    scenario('pause.withOpenVotes', [{ op: 'pause', match: id('match:open') }]);
    for (const key of ['match:paused', 'match:break']) scenario(`pause.throws:${key}`, [{ op: 'pause', match: id(key) }]);
    scenario('resume.paused', [{ op: 'resume', match: id('match:paused') }]);
    scenario('resume.notPaused', [{ op: 'resume', match: id('match:toPause') }]);
    scenario('resume.lastOpenPause', [{ op: 'resume', match: C.match }], { setup: twoOpenPauses });
    scenario('pause.resume.pause', ['pause', 'resume', 'pause'].map((op) => ({ op, match: id('match:toPause') })));

    const setResult = (key, winner, stoppage, times = 1) =>
        Array.from({ length: times }, () => ({ op: 'setResult', match: id(key), winner, stoppage }));
    const RESULT_WRITES = [
        ['match:toSubmission',  'red',   false],
        ['match:toSubmission',  'red',   undefined],
        ['match:toStoppage',    'blue',  true],
        ['match:toSubmission',  'RED',   true],
        ['match:toClearResult', undefined, undefined],
        ['match:toClearResult', null,    true],
        ['match:done',          'blue',  false],
    ];
    RESULT_WRITES.forEach(([key, winner, stoppage], i) => scenario(`setResult.write:${i}`, setResult(key, winner, stoppage)));
    const RESULT_NOOPS = [
        ['clear an already-empty result',          'match:toSubmission',  undefined, undefined, 1],
        ['clear twice',                            'match:toClearResult', undefined, undefined, 2],
        ['same winner, stoppage null, twice',      'match:toSubmission',  'red',     null,      2],
        ['same winner and stoppage true, twice',   'match:toStoppage',    'blue',    true,      2],
        ['same winner and stoppage false, twice',  'match:toStoppage',    'blue',    false,     2],
    ];
    RESULT_NOOPS.forEach(([, key, winner, stoppage, times], i) => scenario(`setResult.noop:${i}`, setResult(key, winner, stoppage, times as number)));
    scenario('setResult.notEnded', setResult('match:open', 'red', false));
    scenario('setResult.unknownColour', setResult('match:toSubmission', 'green', false));
    scenario('setResult.missingCompetitor', setResult(C.match, 'red', false), {
        setup: (add) => { addMatch(add, { red: C.ghostUser, breakStartedAt: 590, breakDuration: 60 }); addRound(add, C.r1, { start: 500, end: 590, winner: IDS['user:blue'], stoppage: 1 }); },
    });

    const vote = (op, key, judgeKey, rider) => ({ op, match: id(key), judge: judge(judgeKey), rider });
    scenario('vote.start', [vote('startRidingTime', 'match:toVote', 'judgeA', 'red')]);
    scenario('vote.alreadyActive', [vote('startRidingTime', 'match:open', 'judgeA', 'red')]);
    scenario('vote.end', [vote('endRidingTime', 'match:open', 'judgeA', 'blue')]);
    scenario('vote.endIgnoresRider', [vote('endRidingTime', C.match, 'judgeA', 'blue')], {
        setup: (add) => { addMatch(add); addRound(add, C.r1, { start: 500 }); addVote(add, C.v1, { round: C.r1, judge: judge('judgeA'), competitor: IDS['user:red'], start: 510 }); },
    });
    scenario('vote.endWithoutOpenVote', [vote('endRidingTime', 'match:toVote', 'judgeA', 'red')]);
    scenario('vote.startEndStart', [
        vote('startRidingTime', 'match:toVote', 'judgeB', 'blue'),
        vote('endRidingTime',   'match:toVote', 'judgeB', 'blue'),
        vote('startRidingTime', 'match:toVote', 'judgeB', 'Red'),
    ]);
    for (const rider of ['green', undefined]) scenario(`vote.badRider:${rider}`, [vote('startRidingTime', 'match:toVote', 'judgeA', rider)]);
    scenario('vote.missingCompetitor', [vote('startRidingTime', C.match, 'judgeA', 'red')], {
        setup: (add) => { addMatch(add, { red: C.ghostUser }); addRound(add, C.r1, { start: 500 }); },
    });
    scenario('vote.endVote', [{ op: 'endVote', match: id('match:soloJudge'), judge: judge('judgeA') }]);

    return { scenarios: S, NO_ROUND_CASES, RESULT_WRITES, RESULT_NOOPS, at, iso };
}

/** Each step run by the current implementation. */
function modernSteps(db) {
    /* eslint-disable global-require */
    const Matches  = require('../../src/db/repositories/matches');
    const Rounds   = require('../../src/db/repositories/rounds');
    const Votes    = require('../../src/db/repositories/votes');
    const MatchSvc = require('../../src/services/matchLifecycle');
    const RoundSvc = require('../../src/services/roundLifecycle');
    const VoteSvc  = require('../../src/services/ridingTimeVotes');
    /* eslint-enable global-require */
    const lastRound = (matchId) => Rounds.findLastRound(db, matchId);
    return {
        start:      async (s) => { await MatchSvc.startMatch(db, await Matches.findMatchById(db, s.match)); },
        end:        async (s) => { await MatchSvc.endMatch(db, await Matches.findMatchById(db, s.match)); },
        startRound: async (s) => { await MatchSvc.startRound(db, s.match); },
        endRound:   async (s) => { await MatchSvc.endRound(db, s.match, s.opts); },
        workerTechFall: async (s) => {
            for (const round of (await Rounds.findOpenRounds(db)).filter((r) => r.id === s.round)) {
                const match = await Matches.findMatchById(db, round.match_id);
                await MatchSvc.endRound(db, match.id);
            }
        },
        workerRoundTimer: async (s) => { await MatchSvc.endRound(db, (await Rounds.findOpenRounds(db)).find((r) => r.id === s.round).match_id); },
        workerBreakTransition: async (s) => {
            for (const match of (await Matches.findMatchesInBreak(db)).filter((m) => m.id === s.match)) {
                await Matches.updateMatch(db, match.id, { break_started_at: null, break_duration: null });
                await MatchSvc.startRound(db, match.id);
            }
        },
        pause:     async (s) => { await RoundSvc.pauseRound(db, await lastRound(s.match)); },
        resume:    async (s) => { await RoundSvc.resumeRound(db, await lastRound(s.match)); },
        setResult: async (s) => { await RoundSvc.setRoundResult(db, await lastRound(s.match), { winner: s.winner, stoppage: s.stoppage }); },
        startRidingTime: async (s) => { await VoteSvc.startRidingTime(db, await lastRound(s.match), s.judge, s.rider); },
        endRidingTime:   async (s) => { await VoteSvc.endRidingTime(db, await lastRound(s.match), s.judge, s.rider); },
        endVote: async (s) => { await VoteSvc.endVote(db, await Votes.findOpenVoteForJudge(db, (await lastRound(s.match)).id, s.judge)); },
    };
}

function encodeOutcome(outcome) {
    return outcome.ok ? { ok: true, value: outcome.value === undefined ? UNDEFINED : outcome.value } : outcome;
}

/**
 * Runs one scenario against `client` (a raw bun:sqlite handle with the audit
 * triggers) with `stepsImpl`, starting from `snapshot`, and returns its record
 * plus the full end state for assertions.
 */
async function runScenario({ client, snapshot, labels, stepsImpl }, scenario) {
    H.restore(client, snapshot);
    if (scenario.setup) scenario.setup((table, rows) => H.insertRaw(client, table, rows));
    const before = D.dumpRows(client);
    const known  = D.idsOf(before);

    setSystemTime(new Date(scenario.at));
    let outcome;
    try {
        outcome = await H.settle(async () => {
            for (const step of scenario.steps) await stepsImpl[step.op](step);
        });
    } finally {
        setSystemTime();
    }

    const audit = D.readAudit(client);
    const after = D.dumpRows(client);
    const scenarioLabels = D.labelGenerated(new Map(labels), known, audit, after);
    const record = {
        key:     scenario.key,
        outcome: encodeOutcome(outcome),
        writes:  D.auditEntries(audit, scenarioLabels),
        changes: D.rowChanges(before, after, scenarioLabels),
    };
    return { record, outcome, after: Object.fromEntries(Object.entries(after).map(([t, rows]) => [t, rows.map((r) => D.relabel(r, scenarioLabels))])) };
}

export { C, X, buildScenarios, modernSteps, runScenario, encodeOutcome };
