/**
 * Deterministic contract fixture graph.
 *
 * Everything here is built with FIXED primary keys, FIXED mat codes and a
 * CALLER-CONTROLLED clock, so that every byte of every captured response is
 * reproducible. That is what lets the goldens assert real timestamps and real
 * computed values (`time_remaining`, `break_remaining`, riding-time `score`)
 * instead of masking them behind placeholders.
 *
 * Two rules govern this file:
 *
 * 1. **Coverage of states beats volume.** A golden for a round that never
 *    ended proves nothing about the ended-round shape, so every
 *    `RoundResultType` the Kotlin client knows about (`points`, `submission`,
 *    `stoppage`, `tie`, `tech-fall`) has a dedicated round here, plus an
 *    in-progress round, a paused round and a round with a completed pause.
 *
 * 2. **Fixtures are built through the models, not the HTTP API.** The API can
 *    only reach a few of those states, and only in a fixed order. Building the
 *    rows directly is what makes exotic states (tech-fall, tie, mid-break)
 *    available to a plain `GET`. The mutating endpoints are still exercised
 *    for real by the capture plan — on the dedicated `flowMat` fixtures.
 *
 * See `README.md` in this directory for what the goldens are and what changing
 * one means.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const { Mat }            = require('../../models/mat');
const { MatCode }        = require('../../models/matCode');
const { Match }          = require('../../models/match');
const { RidingTimeVote } = require('../../models/ridingTimeVote');
const { Round }          = require('../../models/round');
const { RoundPause }     = require('../../models/roundPause');
const { User }           = require('../../models/user');


/** A controllable wall clock. `capture.ts` backs this with `jest.setSystemTime`. */
export interface Clock {
    /** Freeze `Date.now()` / `new Date()` at `ms` (epoch milliseconds). */
    set(ms: number): void;
}


/** Epoch of the whole fixture graph. Every seeded timestamp derives from it. */
export const T0 = Date.parse('2026-01-01T12:00:00.000Z');

/** The instant the capture run "happens at". Held for the whole HTTP/WS pass. */
export const NOW = T0 + 10 * 60 * 1000; // 2026-01-01T12:10:00.000Z


/** Builds one of the reserved fixture UUIDs. `suffix` must be <= 12 hex chars. */
function uuid(suffix: string): string {
    return `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
}


/**
 * Every fixed identifier in the graph, with a semantic name.
 *
 * The normalizer in `capture.ts` turns each of these into a readable
 * placeholder (`<user:creator>`, `<match:done>`, …) so a golden diff names the
 * thing that changed instead of showing two indistinguishable UUIDs.
 */
export const IDS = {
    // --- users ---------------------------------------------------------------
    'user:creator':   uuid('c0'),
    'user:judgeA':    uuid('c1'),
    'user:judgeB':    uuid('c2'),
    'user:viewer':    uuid('c3'),
    'user:outsider':  uuid('c4'),
    'user:joiner':    uuid('c5'),
    'user:red':       uuid('d0'),
    'user:blue':      uuid('d1'),
    'user:red2':      uuid('d2'),
    'user:blue2':     uuid('d3'),

    // --- api tokens ----------------------------------------------------------
    'token:creator':  uuid('a1c0'),
    'token:judgeA':   uuid('a1c1'),
    'token:judgeB':   uuid('a1c2'),
    'token:viewer':   uuid('a1c3'),
    'token:outsider': uuid('a1c4'),
    'token:joiner':   uuid('a1c5'),
    'token:red':      uuid('a1d0'),
    'token:blue':     uuid('a1d1'),
    'token:red2':     uuid('a1d2'),
    'token:blue2':    uuid('a1d3'),

    // --- mats ----------------------------------------------------------------
    'mat:main':       uuid('e0'),
    'mat:empty':      uuid('e1'),
    'mat:flow':       uuid('e2'),
    'mat:join':       uuid('e3'),
    'mat:solo':       uuid('e4'),

    // --- mat codes (row ids; the code STRINGS are in CODES below) ------------
    'matcode:main-admin':   uuid('e100'),
    'matcode:main-viewer':  uuid('e101'),
    'matcode:empty-admin':  uuid('e110'),
    'matcode:empty-viewer': uuid('e111'),
    'matcode:flow-admin':   uuid('e120'),
    'matcode:flow-viewer':  uuid('e121'),
    'matcode:join-admin':   uuid('e130'),
    'matcode:join-viewer':  uuid('e131'),
    'matcode:solo-admin':   uuid('e140'),
    'matcode:solo-viewer':  uuid('e141'),

    // --- matches on mat:main (read-only goldens) -----------------------------
    'match:done':     uuid('f0'),
    'match:techfall': uuid('f1'),
    'match:tie':      uuid('f2'),
    'match:open':     uuid('f3'),
    'match:paused':   uuid('f4'),
    'match:break':    uuid('f5'),
    'match:upcoming': uuid('f6'),

    // --- matches on mat:flow (mutated by the capture plan) -------------------
    'match:toStart':       uuid('f10'),
    'match:toEnd':         uuid('f11'),
    'match:toStartRound':  uuid('f12'),
    'match:toEndRound':    uuid('f13'),
    'match:toSubmission':  uuid('f14'),
    'match:toStoppage':    uuid('f15'),
    'match:toClearResult': uuid('f16'),
    'match:toPause':       uuid('f17'),
    'match:toVote':        uuid('f18'),
    'match:notStarted':    uuid('f19'),
    'match:wsTechFall':    uuid('f1a'),
    'match:wsBreakEnded':  uuid('f1b'),
    'match:breakNoRounds': uuid('f1c'),
    'match:soloJudge':     uuid('f1d'),

    // --- rounds --------------------------------------------------------------
    'round:done-1':        uuid('a00'),
    'round:done-2':        uuid('a01'),
    'round:done-3':        uuid('a02'),
    'round:techfall':      uuid('a10'),
    'round:tie':           uuid('a20'),
    'round:open':          uuid('a30'),
    'round:paused':        uuid('a40'),
    'round:break':         uuid('a50'),
    'round:toEnd':         uuid('a60'),
    'round:toStartRound':  uuid('a61'),
    'round:toEndRound':    uuid('a62'),
    'round:toSubmission':  uuid('a63'),
    'round:toStoppage':    uuid('a64'),
    'round:toClearResult': uuid('a65'),
    'round:toPause':       uuid('a66'),
    'round:toVote':        uuid('a67'),
    'round:wsTechFall':    uuid('a68'),
    'round:wsBreakEnded':  uuid('a69'),
    'round:soloJudge':     uuid('a6a'),

    // --- round pauses --------------------------------------------------------
    'pause:open-closed':   uuid('b00'),
    'pause:paused-open':   uuid('b10'),
    'pause:break-closed':  uuid('b20'),
} as const;


/** Fixed, human-readable mat codes (the API normally generates random ones). */
export const CODES = {
    'code:main-admin':   'alpha.bravo.charlie',
    'code:main-viewer':  'delta.echo.foxtrot',
    'code:empty-admin':  'golf.hotel.india',
    'code:empty-viewer': 'juliet.kilo.lima',
    'code:flow-admin':   'mike.november.oscar',
    'code:flow-viewer':  'papa.quebec.romeo',
    'code:join-admin':   'sierra.tango.uniform',
    'code:join-viewer':  'victor.whiskey.xray',
    'code:solo-admin':   'yankee.zulu.anchor',
    'code:solo-viewer':  'beacon.cobalt.dynamo',
} as const;


// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

async function makeUser(clock: Clock, at: number, key: string, name: string) {
    clock.set(at);
    return await User.create({
        id:        IDS[key as keyof typeof IDS],
        name,
        api_token: IDS[key.replace('user:', 'token:') as keyof typeof IDS],
    });
}


async function makeMat(clock: Clock, at: number, key: string, name: string,
                       creatorId: string, judgeCount: number | null) {
    clock.set(at);
    // `judge_count` is NOT NULL with a DB default of 1. Passing an explicit
    // null is a validation error, so "unspecified" has to mean omitting the
    // key — which is also how MatsController creates a mat without one.
    const attributes: Record<string, any> = {
        id:         IDS[key as keyof typeof IDS],
        name,
        creator_id: creatorId,
    };
    if (judgeCount != null) attributes.judge_count = judgeCount;
    const mat = await Mat.create(attributes);

    const slug = key.replace('mat:', '');
    await MatCode.create({
        id:      IDS[`matcode:${slug}-admin` as keyof typeof IDS],
        mat_id:  mat.id,
        code:    CODES[`code:${slug}-admin` as keyof typeof CODES],
        role:    'admin',
    });
    await MatCode.create({
        id:      IDS[`matcode:${slug}-viewer` as keyof typeof IDS],
        mat_id:  mat.id,
        code:    CODES[`code:${slug}-viewer` as keyof typeof CODES],
        role:    'viewer',
    });

    return mat;
}


interface MatchSpec {
    key:       string;
    at:        number;
    matId:     string;
    red:       string;
    blue:      string;
    startedAt?: number | null;
    endedAt?:   number | null;
    breakStartedAt?: number | null;
    breakDuration?:  number | null;
    judges?:   any[];
}

async function makeMatch(clock: Clock, spec: MatchSpec) {
    clock.set(spec.at);
    const match = await Match.create({
        id:                IDS[spec.key as keyof typeof IDS],
        mat_id:            spec.matId,
        creator_id:        IDS['user:creator'],
        red_competitor_id: spec.red,
        blue_competitor_id: spec.blue,
        started_at:        spec.startedAt == null ? null : new Date(spec.startedAt),
        ended_at:          spec.endedAt   == null ? null : new Date(spec.endedAt),
        break_started_at:  spec.breakStartedAt == null ? null : new Date(spec.breakStartedAt),
        break_duration:    spec.breakDuration ?? null,
    });
    if (spec.judges?.length) await match.setJudges(spec.judges);
    return match;
}


interface RoundSpec {
    key:      string;
    matchId:  string;
    /** Round start = `created_at`; `Round.started_at` is an alias for it. */
    startedAt: number;
    endedAt?:  number | null;
    declaredWinnerId?: string | null;
    stoppage?: boolean | null;
}

async function makeRound(clock: Clock, spec: RoundSpec) {
    clock.set(spec.startedAt);
    return await Round.create({
        id:                 IDS[spec.key as keyof typeof IDS],
        match_id:           spec.matchId,
        ended_at:           spec.endedAt == null ? null : new Date(spec.endedAt),
        declared_winner_id: spec.declaredWinnerId ?? null,
        stoppage:           spec.stoppage ?? null,
    });
}


/**
 * Creates one riding-time vote per judge for `competitorId`, all starting at
 * `from` and (optionally) ending at `to`.
 *
 * With two judges the consensus threshold is 2 (`src/domain/ridingTime.ts`), so both
 * votes must overlap for any control time to accrue. Score is
 * `floor(seconds / 3)` per `RDojoKombatRules.scoreRound`.
 */
async function makeConsensusVotes(clock: Clock, roundKey: string, roundId: string,
                                  competitorId: string, judges: string[],
                                  from: number, to: number | null) {
    const votes: any[] = [];
    clock.set(from);
    for (let i = 0; i < judges.length; i++) {
        votes.push(await RidingTimeVote.create({
            round_id:      roundId,
            judge_id:      judges[i],
            competitor_id: competitorId,
        }));
    }
    if (to != null) {
        clock.set(to);
        for (const vote of votes) {
            vote.ended_at = new Date(to);
            await vote.save();
        }
    }
    return votes;
}


// ---------------------------------------------------------------------------
// The graph
// ---------------------------------------------------------------------------

export interface Fixtures {
    users:   Record<string, any>;
    mats:    Record<string, any>;
    matches: Record<string, any>;
}


/** Seconds after {@link T0}, as epoch milliseconds. The whole timeline uses it. */
function at(seconds: number): number {
    return T0 + seconds * 1000;
}


/**
 * Builds the whole fixture graph and leaves the clock frozen at {@link NOW}.
 *
 * Call exactly once per database. The database must be empty and migrated.
 *
 * TIMELINE (seconds after T0; the capture pass observes at T0+600)
 * ----------------------------------------------------------------
 * A match's `created_at` and its `started_at` are set independently on
 * purpose: `created_at` decides mat ordering (`current_match` is the earliest
 * *started and incomplete* match), while `started_at` and the round times are
 * what the payload shows. Splitting them lets every round state exist
 * simultaneously at one frozen instant, which a strictly chronological seed
 * could not do.
 *
 *   0- 9   users
 *  10-14   mats and rosters
 *  20      match:done      started 20;  R1 20-90 (60s consensus = 20 pts)
 *                                       R2 100-160 (submission)
 *                                       R3 170-200 (stoppage); ended 200
 *  30      match:open      started 470; R 470-open, pause 480-490, votes open @500
 *  40      match:paused    started 480; R 480-open, pause opened @500 (unresolved)
 *  50      match:break     started 490; R 490-580; break @580 for 60s
 *  60      match:techfall  started 210; R 210-310 (90s consensus = 30 >= 24)
 *  70      match:tie       started 320; R 320-340 (no votes at all)
 *  80      match:upcoming  never started
 *  100-210 mat:flow matches, driven through the real endpoints by capture.ts
 */
export async function seed(clock: Clock): Promise<Fixtures> {
    const users: Record<string, any> = {};
    const mats: Record<string, any> = {};
    const matches: Record<string, any> = {};

    // --- users ---------------------------------------------------------------
    users.creator  = await makeUser(clock, at(0), 'user:creator',  'Casey Creator');
    users.judgeA   = await makeUser(clock, at(1), 'user:judgeA',   'Jordan Judge');
    users.judgeB   = await makeUser(clock, at(2), 'user:judgeB',   'Jamie Judge');
    users.viewer   = await makeUser(clock, at(3), 'user:viewer',   'Val Viewer');
    users.outsider = await makeUser(clock, at(4), 'user:outsider', 'Ollie Outsider');
    users.joiner   = await makeUser(clock, at(5), 'user:joiner',   'Jo Joiner');
    users.red      = await makeUser(clock, at(6), 'user:red',      'Rory Red');
    users.blue     = await makeUser(clock, at(7), 'user:blue',     'Blair Blue');
    users.red2     = await makeUser(clock, at(8), 'user:red2',     'Robin Red');
    users.blue2    = await makeUser(clock, at(9), 'user:blue2',    'Bailey Blue');

    const judgeIds = [users.judgeA.id, users.judgeB.id];

    // --- mats ----------------------------------------------------------------
    // `mat:main`  — the read-only fixture the mat/match GET goldens describe.
    // `mat:empty` — a mat with no judges and no matches (the "all empty" shape).
    // `mat:flow`  — carries every match the capture plan MUTATES.
    // `mat:join`  — carries the join/leave mutations, so mat:main's roster is stable.
    mats.main  = await makeMat(clock, at(10), 'mat:main',  'Main Mat',  users.creator.id, 2);
    mats.empty = await makeMat(clock, at(11), 'mat:empty', 'Empty Mat', users.creator.id, null);
    mats.flow  = await makeMat(clock, at(12), 'mat:flow',  'Flow Mat',  users.creator.id, 2);
    mats.join  = await makeMat(clock, at(13), 'mat:join',  'Join Mat',  users.creator.id, 2);
    mats.solo  = await makeMat(clock, at(15), 'mat:solo',  'Solo Mat',  users.creator.id, 1);

    clock.set(at(14));
    await mats.main.addJudge(users.judgeA);
    await mats.main.addJudge(users.judgeB);
    await mats.main.addViewer(users.viewer);
    await mats.flow.addJudge(users.judgeA);
    await mats.flow.addJudge(users.judgeB);
    await mats.join.addJudge(users.judgeA);
    await mats.join.addViewer(users.viewer);
    await mats.solo.addJudge(users.judgeA);

    const bothJudges = [users.judgeA, users.judgeB];

    // =========================================================================
    // mat:main — one match per interesting SHAPE
    // =========================================================================

    // --- match:done — ended, three ended rounds: points / submission / stoppage.
    // Red takes rounds 1 and 3, blue takes round 2, so Match.getWinner() resolves
    // to red on a best-2-of-3 over all `maxRounds` rounds. This is the only
    // fixture where `Match.winner` is non-null.
    matches.done = await makeMatch(clock, {
        key: 'match:done', at: at(20), matId: mats.main.id,
        red: users.red.id, blue: users.blue.id,
        startedAt: at(20), endedAt: at(200), judges: bothJudges,
    });
    // Round 1 — POINTS. 60s of two-judge consensus for red is floor(60/3) = 20,
    // which sits under round 1's tech-fall threshold of 24.
    await makeRound(clock, { key: 'round:done-1', matchId: matches.done.id,
                             startedAt: at(20), endedAt: at(90) });
    await makeConsensusVotes(clock, 'round:done-1', IDS['round:done-1'],
                             users.red.id, judgeIds, at(25), at(85));
    // Round 2 — SUBMISSION. A declared winner with `stoppage` falsy.
    await makeRound(clock, { key: 'round:done-2', matchId: matches.done.id,
                             startedAt: at(100), endedAt: at(160),
                             declaredWinnerId: users.blue.id, stoppage: false });
    // Round 3 — STOPPAGE. A declared winner with `stoppage` true.
    await makeRound(clock, { key: 'round:done-3', matchId: matches.done.id,
                             startedAt: at(170), endedAt: at(200),
                             declaredWinnerId: users.red.id, stoppage: true });

    // --- match:open — a round IN PROGRESS, with live votes and a completed
    // pause. `time_remaining` and `score` are both computed against the frozen
    // clock, and `paused` is false because the only pause was resumed.
    // Created first among the incomplete matches, so it is mat:main's
    // `current_match`.
    matches.open = await makeMatch(clock, {
        key: 'match:open', at: at(30), matId: mats.main.id,
        red: users.red.id, blue: users.blue.id,
        startedAt: at(470), judges: bothJudges,
    });
    await makeRound(clock, { key: 'round:open', matchId: matches.open.id,
                             startedAt: at(470) });
    clock.set(at(480));
    await RoundPause.create({ id: IDS['pause:open-closed'], round_id: IDS['round:open'],
                              paused_at: new Date(at(480)), resumed_at: new Date(at(490)) });
    // Votes still OPEN — these accrue against NOW, exercising the live path.
    await makeConsensusVotes(clock, 'round:open', IDS['round:open'],
                             users.blue.id, judgeIds, at(500), null);

    // --- match:paused — a round in progress with an OPEN pause (`paused: true`).
    // `time_remaining` freezes at the pause instant instead of tracking the clock.
    matches.paused = await makeMatch(clock, {
        key: 'match:paused', at: at(40), matId: mats.main.id,
        red: users.red2.id, blue: users.blue.id,
        startedAt: at(480), judges: bothJudges,
    });
    await makeRound(clock, { key: 'round:paused', matchId: matches.paused.id,
                             startedAt: at(480) });
    clock.set(at(500));
    await RoundPause.create({ id: IDS['pause:paused-open'], round_id: IDS['round:paused'],
                              paused_at: new Date(at(500)), resumed_at: null });

    // --- match:break — between rounds. The only read-only fixture with a
    // non-null `break_remaining` (60s break started 20s ago => 40 remaining).
    matches.break = await makeMatch(clock, {
        key: 'match:break', at: at(50), matId: mats.main.id,
        red: users.red.id, blue: users.blue2.id,
        startedAt: at(490), judges: bothJudges,
        breakStartedAt: at(580), breakDuration: 60,
    });
    await makeRound(clock, { key: 'round:break', matchId: matches.break.id,
                             startedAt: at(490), endedAt: at(580) });
    clock.set(at(500));
    await RoundPause.create({ id: IDS['pause:break-closed'], round_id: IDS['round:break'],
                              paused_at: new Date(at(500)), resumed_at: new Date(at(530)) });

    // --- match:techfall — one ended round whose score crosses the threshold.
    // 90s of consensus is floor(90/3) = 30 >= 24, so the method is `tech-fall`
    // and `value` is the winning score as a string.
    matches.techfall = await makeMatch(clock, {
        key: 'match:techfall', at: at(60), matId: mats.main.id,
        red: users.red2.id, blue: users.blue2.id,
        startedAt: at(210), judges: bothJudges,
    });
    await makeRound(clock, { key: 'round:techfall', matchId: matches.techfall.id,
                             startedAt: at(210), endedAt: at(310) });
    await makeConsensusVotes(clock, 'round:techfall', IDS['round:techfall'],
                             users.red2.id, judgeIds, at(215), at(305));

    // --- match:tie — one ended round with no votes at all: 0-0.
    matches.tie = await makeMatch(clock, {
        key: 'match:tie', at: at(70), matId: mats.main.id,
        red: users.red.id, blue: users.blue2.id,
        startedAt: at(320), judges: bothJudges,
    });
    await makeRound(clock, { key: 'round:tie', matchId: matches.tie.id,
                             startedAt: at(320), endedAt: at(340) });

    // --- match:upcoming — created but never started. Populates the mat's
    // `upcoming_matches`.
    matches.upcoming = await makeMatch(clock, {
        key: 'match:upcoming', at: at(80), matId: mats.main.id,
        red: users.red2.id, blue: users.blue2.id,
    });

    // =========================================================================
    // mat:flow — fixtures the capture plan drives through the real endpoints
    // =========================================================================

    // POST /match/:id/start
    matches.toStart = await makeMatch(clock, {
        key: 'match:toStart', at: at(100), matId: mats.flow.id,
        red: users.red.id, blue: users.blue.id,
    });

    // POST /match/:id/end
    matches.toEnd = await makeMatch(clock, {
        key: 'match:toEnd', at: at(110), matId: mats.flow.id,
        red: users.red.id, blue: users.blue.id,
        startedAt: at(520), judges: bothJudges,
    });
    await makeRound(clock, { key: 'round:toEnd', matchId: matches.toEnd.id,
                             startedAt: at(520) });

    // POST /match/:id/rounds — needs the previous round already ended, i.e. a break.
    matches.toStartRound = await makeMatch(clock, {
        key: 'match:toStartRound', at: at(120), matId: mats.flow.id,
        red: users.red.id, blue: users.blue.id,
        startedAt: at(530), judges: bothJudges,
        breakStartedAt: at(595), breakDuration: 60,
    });
    await makeRound(clock, { key: 'round:toStartRound', matchId: matches.toStartRound.id,
                             startedAt: at(530), endedAt: at(595) });

    // POST /match/:id/rounds/end
    matches.toEndRound = await makeMatch(clock, {
        key: 'match:toEndRound', at: at(130), matId: mats.flow.id,
        red: users.red.id, blue: users.blue.id,
        startedAt: at(540), judges: bothJudges,
    });
    await makeRound(clock, { key: 'round:toEndRound', matchId: matches.toEndRound.id,
                             startedAt: at(540) });

    // PATCH /match/:id/rounds/result — submission, stoppage, and clearing.
    // All three need `isResultWindowOpen`, i.e. an active break or an ended match.
    for (const [key, roundKey, createdAt, startedAt] of [
        ['match:toSubmission',  'round:toSubmission',  at(140), at(545)],
        ['match:toStoppage',    'round:toStoppage',    at(150), at(550)],
        ['match:toClearResult', 'round:toClearResult', at(160), at(555)],
    ] as const) {
        const match = await makeMatch(clock, {
            key, at: createdAt, matId: mats.flow.id,
            red: users.red.id, blue: users.blue.id,
            startedAt, judges: bothJudges,
            breakStartedAt: at(595), breakDuration: 60,
        });
        matches[key.replace('match:', '')] = match;
        await makeRound(clock, { key: roundKey, matchId: match.id,
                                 startedAt, endedAt: at(595),
                                 // toClearResult starts WITH a declared result, so
                                 // the `winner: null` PATCH has something to clear.
                                 declaredWinnerId: key === 'match:toClearResult' ? users.red.id : null,
                                 stoppage:         key === 'match:toClearResult' ? true : null });
    }

    // POST /match/:id/rounds/pause + /resume
    matches.toPause = await makeMatch(clock, {
        key: 'match:toPause', at: at(170), matId: mats.flow.id,
        red: users.red.id, blue: users.blue.id,
        startedAt: at(560), judges: bothJudges,
    });
    await makeRound(clock, { key: 'round:toPause', matchId: matches.toPause.id,
                             startedAt: at(560) });

    // POST + DELETE /match/:id/ridingTime
    matches.toVote = await makeMatch(clock, {
        key: 'match:toVote', at: at(180), matId: mats.flow.id,
        red: users.red.id, blue: users.blue.id,
        startedAt: at(565), judges: bothJudges,
    });
    await makeRound(clock, { key: 'round:toVote', matchId: matches.toVote.id,
                             startedAt: at(565) });

    // Never started — the "this match has not started" 400 on POST /end, and the
    // "no active round" 422s on pause/resume.
    matches.notStarted = await makeMatch(clock, {
        key: 'match:notStarted', at: at(190), matId: mats.flow.id,
        red: users.red.id, blue: users.blue.id,
    });

    // --- WebSocket fixtures ---------------------------------------------------
    // Already over the tech-fall threshold with the round still open, so
    // TechFallTrackerWorker ends it and emits `round.tech-fall` on the first tick.
    matches.wsTechFall = await makeMatch(clock, {
        key: 'match:wsTechFall', at: at(200), matId: mats.flow.id,
        red: users.red2.id, blue: users.blue2.id,
        startedAt: at(350), judges: bothJudges,
    });
    await makeRound(clock, { key: 'round:wsTechFall', matchId: matches.wsTechFall.id,
                             startedAt: at(350) });
    await makeConsensusVotes(clock, 'round:wsTechFall', IDS['round:wsTechFall'],
                             users.red2.id, judgeIds, at(355), at(445));

    // Break already expired (started 180s ago for a 60s break), so
    // BreakTransitionWorker starts the next round and emits `break.ended`.
    matches.wsBreakEnded = await makeMatch(clock, {
        key: 'match:wsBreakEnded', at: at(210), matId: mats.flow.id,
        red: users.red.id, blue: users.blue2.id,
        startedAt: at(360), judges: bothJudges,
        breakStartedAt: at(420), breakDuration: 60,
    });
    await makeRound(clock, { key: 'round:wsBreakEnded', matchId: matches.wsBreakEnded.id,
                             startedAt: at(360), endedAt: at(420) });

    // In a break but carrying NO rounds at all. Unreachable through the API
    // (a break only ever starts when a round ends), but it is the only way to
    // open the result window while `getLastRound()` is null, which is the
    // "No ended round to update" 422 branch of patchRoundResult.
    matches.breakNoRounds = await makeMatch(clock, {
        key: 'match:breakNoRounds', at: at(220), matId: mats.flow.id,
        red: users.red.id, blue: users.blue.id,
        startedAt: at(370), judges: bothJudges,
        breakStartedAt: at(595), breakDuration: 60,
    });

    // --- mat:join extras ------------------------------------------------------
    // An in-progress match with exactly ONE judge, on its own mat so the
    // mat:join goldens above are unaffected. Joining mat:solo with the admin
    // code hits UsersController#addAsJudge's "cannot join a solo match in
    // progress" branch. Leaving it again exercises the judge-removal path that
    // closes an open riding-time vote and drops the judge from the live match.
    matches.soloJudge = await makeMatch(clock, {
        key: 'match:soloJudge', at: at(230), matId: mats.solo.id,
        red: users.red.id, blue: users.blue.id,
        startedAt: at(380), judges: [users.judgeA],
    });
    await makeRound(clock, { key: 'round:soloJudge', matchId: matches.soloJudge.id,
                             startedAt: at(380) });
    // One OPEN vote by judgeA, so DELETE /mat/:code/join has a vote to end.
    await makeConsensusVotes(clock, 'round:soloJudge', IDS['round:soloJudge'],
                             users.red.id, [users.judgeA.id], at(390), null);

    // Everything the capture pass observes happens at exactly this instant.
    clock.set(NOW);

    return { users, mats, matches };
}
