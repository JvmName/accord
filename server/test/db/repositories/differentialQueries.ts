/**
 * The read queries behind test/db/repositories/differential.test.ts and the
 * `repositories` snapshot fixture, run over the contract seed. Not a test file.
 *
 * Results are recorded in row form (the table's columns; datetimes as ISO
 * text, `stoppage` as a boolean). A row identical to a seeded row is written
 * as a reference to it (`table:rowid`, see the `seed` fixture); anything else
 * is written out in full. `undefined` and `null` results stay distinct.
 */
import { getTableColumns } from 'drizzle-orm';
import { schema } from '../../../src/db';
import { UNDEFINED } from '../../support/frozen';
import * as D from '../../support/rowDelta';

const ROW_TABLES = ['users', 'mats', 'mat_codes', 'matches', 'rounds', 'riding_time_votes', 'round_pauses'];
const COLUMNS = Object.fromEntries(ROW_TABLES.map((t) => [t, Object.keys(getTableColumns(schema[t]))]));
const DATETIME = /(_at)$/;

/** A row in row form. `stoppage` 0/1 (as stored) and true/false (as read) both become booleans. */
function rowForm(record, table) {
    const out = {};
    for (const c of COLUMNS[table]) {
        let v = record[c];
        if (v instanceof Date) v = v.toISOString();
        if (table === 'rounds' && c === 'stoppage' && v !== null && v !== undefined) v = Boolean(v);
        out[c] = v === undefined ? null : v;
    }
    return out;
}

/** Encoder for result rows against the seed rows (raw, with rowids). */
function rowEncoder(seedRows, labels) {
    const refs = new Map();
    for (const t of ROW_TABLES) {
        for (const row of seedRows[t]) refs.set(`${t}|${JSON.stringify(rowForm(row, t))}`, `${t}:${row.__rowid}`);
    }
    const one = (record, table) => {
        if (record === undefined) return UNDEFINED;
        if (record === null) return null;
        const form = rowForm(record, table);
        return refs.get(`${table}|${JSON.stringify(form)}`) ?? { row: D.relabel(form, labels) };
    };
    return { one, all: (records, table) => records.map((r) => one(r, table)) };
}

const keysWith = (IDS, prefix) => Object.keys(IDS).filter((k) => k.startsWith(prefix));

/**
 * The records, from a reader that answers every query. `reader` methods may
 * return rows; `enc` turns them into row form.
 */
async function recordQueries({ IDS, CODES }, reader, enc) {
    const records: any[] = [];
    for (const key of keysWith(IDS, 'match:')) {
        const g = await reader.matchGraph(IDS[key]);
        records.push({
            key: `matchGraph ${key}`,
            match: enc.one(g.match, 'matches'),
            mat: enc.one(g.mat, 'mats'),
            redCompetitor: enc.one(g.redCompetitor, 'users'),
            blueCompetitor: enc.one(g.blueCompetitor, 'users'),
            judges: enc.all(g.judges, 'users'),
            rounds: g.rounds.map((r) => ({
                round: enc.one(r.round, 'rounds'),
                ridingTimeVotes: enc.all(r.ridingTimeVotes, 'riding_time_votes'),
                pauses: enc.all(r.pauses, 'round_pauses'),
            })),
        });
    }
    records.push({ key: 'openRounds', rows: enc.all(await reader.openRounds(), 'rounds') });
    records.push({ key: 'matchesInBreak', rows: enc.all(await reader.matchesInBreak(), 'matches') });
    for (const key of keysWith(IDS, 'match:')) {
        const h = await reader.matchHelpers(IDS[key], [IDS['user:judgeA'], IDS['user:judgeB']]);
        records.push({
            key: `matchHelpers ${key}`,
            lastRound: enc.one(h.lastRound, 'rounds'),
            judges: enc.all(h.judges, 'users'),
            rounds: h.rounds.map((r) => ({
                round: enc.one(r.round, 'rounds'),
                openVotes: enc.all(r.openVotes, 'riding_time_votes'),
                currentPause: enc.one(r.currentPause, 'round_pauses'),
                openVoteFor: r.openVoteFor.map((v) => enc.one(v, 'riding_time_votes')),
            })),
        });
    }
    for (const key of keysWith(IDS, 'mat:')) {
        const m = await reader.mat(IDS[key], IDS['user:viewer'], IDS['user:outsider']);
        records.push({
            key: `mat ${key}`,
            mat: enc.one(m.mat, 'mats'),
            judges: enc.all(m.judges, 'users'),
            viewers: enc.all(m.viewers, 'users'),
            codes: enc.all(m.codes, 'mat_codes'),
            incompleteMatches: enc.all(m.incompleteMatches, 'matches'),
            viewerFiltered: enc.all(m.viewerFiltered, 'users'),
            nonViewerFiltered: enc.all(m.nonViewerFiltered, 'users'),
        });
    }
    for (const key of [...keysWith(IDS, 'token:'), 'nope']) {
        records.push({ key: `userByApiToken ${key}`, user: enc.one(await reader.userByApiToken(IDS[key] ?? key), 'users') });
    }
    for (const key of [...keysWith(IDS, 'user:'), 'nope']) {
        records.push({ key: `userById ${key}`, user: enc.one(await reader.userById(IDS[key] ?? key), 'users') });
    }
    for (const code of [...Object.values(CODES), 'no.such.code']) {
        records.push({
            key: `code ${code}`,
            matCode: enc.one(await reader.matCodeByCode(code), 'mat_codes'),
            mat: enc.one(await reader.matByCode(code), 'mats'),
        });
    }
    records.push({ key: 'CODE_REGEXP', source: reader.codeRegexp.source, flags: reader.codeRegexp.flags });
    return records;
}

/** The reader over the Drizzle repositories. */
function repositoryReader(db) {
    /* eslint-disable global-require */
    const Users    = require('../../../src/db/repositories/users');
    const Mats     = require('../../../src/db/repositories/mats');
    const MatCodes = require('../../../src/db/repositories/matCodes');
    const Matches  = require('../../../src/db/repositories/matches');
    const Rounds   = require('../../../src/db/repositories/rounds');
    const Votes    = require('../../../src/db/repositories/votes');
    /* eslint-enable global-require */
    return {
        async matchGraph(id) {
            const g = await Matches.findMatchGraph(db, id);
            return {
                match: g, mat: g.mat, redCompetitor: g.redCompetitor, blueCompetitor: g.blueCompetitor, judges: g.judges,
                rounds: g.rounds.map((r) => ({ round: r, ridingTimeVotes: r.ridingTimeVotes, pauses: r.pauses })),
            };
        },
        openRounds: () => Rounds.findOpenRounds(db),
        matchesInBreak: () => Matches.findMatchesInBreak(db),
        async matchHelpers(id, judgeIds) {
            const rounds: any[] = [];
            for (const round of await Rounds.findMatchRounds(db, id)) {
                const openVoteFor: any[] = [];
                for (const judgeId of judgeIds) openVoteFor.push(await Votes.findOpenVoteForJudge(db, round.id, judgeId));
                rounds.push({ round, openVotes: await Votes.findOpenRoundVotes(db, round.id), currentPause: await Rounds.findCurrentPause(db, round.id), openVoteFor });
            }
            return { lastRound: await Rounds.findLastRound(db, id), judges: await Matches.findMatchJudges(db, id), rounds };
        },
        async mat(id, viewerId, nonViewerId) {
            return {
                mat: await Mats.findMatById(db, id),
                judges: await Mats.findMatJudges(db, id),
                viewers: await Mats.findMatViewers(db, id),
                codes: await MatCodes.findMatCodesForMat(db, id),
                incompleteMatches: await Mats.findIncompleteMatchesForMat(db, id),
                viewerFiltered: await Mats.findMatViewers(db, id, { userId: viewerId }),
                nonViewerFiltered: await Mats.findMatViewers(db, id, { userId: nonViewerId }),
            };
        },
        userByApiToken: (token) => Users.findUserByApiToken(db, token),
        userById: (id) => Users.findUserById(db, id),
        matCodeByCode: (code) => MatCodes.findMatCodeByCode(db, code),
        matByCode: (code) => Mats.findMatByCode(db, code),
        codeRegexp: require('../../../src/domain/matCode').CODE_REGEXP, // eslint-disable-line global-require
    };
}

export { COLUMNS, ROW_TABLES, recordQueries, repositoryReader, rowEncoder, rowForm };
