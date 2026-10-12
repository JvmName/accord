/**
 * Plain-object fixture rows for the serializer unit tests (task 11). Not a
 * test file. Shapes are Drizzle rows (`src/db/types.ts`): every datetime is a
 * `Date`, `stoppage` is a boolean. No database is involved.
 */
const T0 = Date.parse('2026-01-01T12:00:00.000Z');
const at = (seconds) => new Date(T0 + seconds * 1000);
const iso = (seconds) => at(seconds).toISOString();
const uuid = (suffix) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const ID = {
    creator: uuid('c0'),
    judgeA:  uuid('c1'),
    judgeB:  uuid('c2'),
    red:     uuid('d0'),
    blue:    uuid('d1'),
    mat:     uuid('e0'),
    match:   uuid('f0'),
};

function user(id, name, seconds = 0) {
    return { id, name, api_token: `token-${id}`, created_at: at(seconds), updated_at: at(seconds + 1) };
}

const USERS = {
    creator: user(ID.creator, 'Casey Creator', 0),
    judgeA:  user(ID.judgeA, 'Jordan Judge', 1),
    judgeB:  user(ID.judgeB, 'Jamie Judge', 2),
    red:     user(ID.red, 'Rory Red', 6),
    blue:    user(ID.blue, 'Blair Blue', 7),
};

function mat(overrides = {}) {
    return { id: ID.mat, name: 'Main Mat', judge_count: 2, creator_id: ID.creator, created_at: at(10), updated_at: at(10), ...overrides };
}

let seq = 0;
const nextId = (prefix) => uuid(`${prefix}${(++seq).toString(16)}`);

/** Votes by each judge for `competitorId` from `from` to `to` (null = still open). */
function votes(competitorId, judges, from, to) {
    return judges.map((j) => ({
        id: nextId('b'), round_id: 'set-by-round', judge_id: j.id, competitor_id: competitorId,
        ended_at: to == null ? null : at(to), created_at: at(from), updated_at: at(to ?? from),
    }));
}

function pause(paused, resumed) {
    return { id: nextId('p'), round_id: 'set-by-round', paused_at: at(paused), resumed_at: resumed == null ? null : at(resumed),
             created_at: at(paused), updated_at: at(resumed ?? paused) };
}

/** A round row with activity, as `findMatchGraph` returns it. */
function round({ id, started, ended = null, declaredWinnerId = null, stoppage = null, ridingTimeVotes = [], pauses = [] } = {}) {
    const roundId = id ?? nextId('a');
    return {
        id: roundId, match_id: ID.match, ended_at: ended == null ? null : at(ended),
        created_at: at(started), updated_at: at(ended ?? started),
        declared_winner_id: declaredWinnerId, stoppage,
        ridingTimeVotes: ridingTimeVotes.map((v) => ({ ...v, round_id: roundId })),
        pauses: pauses.map((p) => ({ ...p, round_id: roundId })),
    };
}

/** A full `MatchGraph` (match row + mat + competitors + judges + rounds). */
function matchGraph(overrides = {}) {
    return {
        id: ID.match, creator_id: ID.creator, mat_id: ID.mat,
        red_competitor_id: ID.red, blue_competitor_id: ID.blue,
        red_score: 7, blue_score: 3, // columns that must NEVER reach the wire
        started_at: at(20), ended_at: null,
        created_at: at(20), updated_at: at(20),
        break_started_at: null, break_duration: null,
        mat: mat(),
        redCompetitor: USERS.red, blueCompetitor: USERS.blue,
        judges: [USERS.judgeA, USERS.judgeB],
        rounds: [],
        ...overrides,
    };
}

/** Recursively collects every key in a JSON-ish tree. */
function allKeys(value, out = new Set()) {
    if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) { out.add(k); allKeys(v, out); }
    }
    return out;
}

module.exports = { T0, at, iso, uuid, ID, USERS, user, mat, votes, pause, round, matchGraph, allKeys };
