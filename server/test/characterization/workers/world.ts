/**
 * A scratch database for the worker characterization tests: an in-memory
 * Drizzle database with audit triggers (every write is logged, in order), two
 * judges, two competitors and a mat, plus builders for matches, rounds, votes
 * and pauses at times relative to a fixed NOW. Not a test file.
 */
import * as H from '../../services/support';

const NOW_MS = Date.parse('2026-01-01T12:00:00.000Z');
const NOW    = new Date(NOW_MS);
const X      = (suffix) => `00000000-0000-4000-9000-${String(suffix).padStart(12, '0')}`;
const ago    = (seconds) => new Date(NOW_MS - seconds * 1000).toISOString();
const stamps = (seconds) => ({ created_at: ago(seconds), updated_at: ago(seconds) });

const U = { creator: X('c0'), judgeA: X('c1'), judgeB: X('c2'), red: X('d0'), blue: X('d1') };
const MAT = X('e0');

function createWorld() {
    const db = H.modernDb();
    const add = (table, rows) => H.insertRaw(db.$client, table, rows);
    add('users', Object.entries(U).map(([name, id], i) => ({ id, name, api_token: X(`a${i}`), ...stamps(10000) })));
    add('mats', [{ id: MAT, name: 'mat', judge_count: 2, creator_id: U.creator, ...stamps(10000) }]);

    const world = {
        db,
        client: db.$client,
        /** A started match with both judges. `breakSecondsAgo` / `breakDuration` put it in a break. */
        match(id, { ended = false, breakSecondsAgo = null, breakDuration = null } = {}) {
            add('matches', [{
                id, creator_id: U.creator, mat_id: MAT, red_competitor_id: U.red, blue_competitor_id: U.blue,
                red_score: 0, blue_score: 0, started_at: ago(5000), ended_at: ended ? ago(1) : null,
                break_started_at: breakSecondsAgo == null ? null : ago(breakSecondsAgo), break_duration: breakDuration, ...stamps(5000),
            }]);
            add('judges_matches', [U.judgeA, U.judgeB].map((user_id) => ({ match_id: id, user_id, ...stamps(5000) })));
            return world;
        },
        /** A round started `startedSecondsAgo` ago; ended `endedSecondsAgo` ago when given. */
        round(id, matchId, { startedSecondsAgo, endedSecondsAgo = null }) {
            add('rounds', [{ id, match_id: matchId, ended_at: endedSecondsAgo == null ? null : ago(endedSecondsAgo), ...stamps(startedSecondsAgo), declared_winner_id: null, stoppage: null }]);
            return world;
        },
        /** Both judges vote `competitor` from `startedSecondsAgo` (until `endedSecondsAgo`, else open). */
        consensus(idBase, roundId, competitor, { startedSecondsAgo, endedSecondsAgo = null }) {
            add('riding_time_votes', [U.judgeA, U.judgeB].map((judge_id, i) => ({
                id: X(`${idBase}${i}`), round_id: roundId, judge_id, competitor_id: competitor,
                ended_at: endedSecondsAgo == null ? null : ago(endedSecondsAgo), ...stamps(startedSecondsAgo),
            })));
            return world;
        },
        pause(id, roundId, { startedSecondsAgo, endedSecondsAgo = null }) {
            add('round_pauses', [{ id, round_id: roundId, paused_at: ago(startedSecondsAgo), resumed_at: endedSecondsAgo == null ? null : ago(endedSecondsAgo), ...stamps(startedSecondsAgo) }]);
            return world;
        },
        row: (table, id) => db.$client.query(`SELECT * FROM "${table}" WHERE id = ?`).get(id),
        /** `"<OP> <table>"` for every write since the world was built. */
        writes: () => db.$client.query('SELECT tbl, op FROM zz_audit ORDER BY seq').all().map((e: { op: string; tbl: string }) => `${e.op} ${e.tbl}`),
        close: () => db.$client.close(),
    };
    db.$client.run('DELETE FROM zz_audit');
    return world;
}

/** A database whose every use rejects with `message` (for the failure-path tests). */
function failingDb(message) {
    return new Proxy({}, { get() { throw new Error(message); } });
}

export { MAT, NOW, NOW_MS, U, X, ago, createWorld, failingDb };
