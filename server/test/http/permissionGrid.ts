/**
 * The permission grid behind test/http/permissions.test.ts and the
 * `permissions` snapshot fixture: every subject (user x mat code) x scope x
 * action. Not a test file.
 *
 * Record layout: an `axes` record lists the axes once, then one record per
 * subject (`<user>/<code>`) holding one string per scope, one character per
 * action: `G` grant, `d` deny, or a digit naming a thrown error in the
 * legend of the `axes` record.
 */
const USERS = { creator: 'u-creator', judge: 'u-judge', other: 'u-other', creator2: 'u-creator2' };
const MATS  = { mat1: { id: 'mat-1', creator_id: USERS.creator }, mat2: { id: 'mat-2', creator_id: USERS.creator2 } };

const MATCHES = {
    // started match on mat1, judged by `judge`
    matchA: { id: 'match-a', mat_id: MATS.mat1.id, judges: [USERS.judge] },
    // match on mat2 with no judges
    matchB: { id: 'match-b', mat_id: MATS.mat2.id, judges: [] },
    // match whose mat row is missing (impossible through the API): `manage` throws
    matchOrphan: { id: 'match-orphan', mat_id: 'mat-missing', judges: [USERS.judge] },
};

const MAT_CODES = {
    none:        null,
    mat1Admin:   { mat_id: MATS.mat1.id, role: 'admin' },
    mat1Viewer:  { mat_id: MATS.mat1.id, role: 'viewer' },
    mat2Admin:   { mat_id: MATS.mat2.id, role: 'admin' },
    mat2Viewer:  { mat_id: MATS.mat2.id, role: 'viewer' },
    mat1OddRole: { mat_id: MATS.mat1.id, role: 'ADMIN' },
};

const SUBJECT_USERS = { anonymous: null, ...USERS };

const ACTIONS = ['assign', 'create a match', 'create', 'be assigned judge', 'view', 'judge', 'manage', 'pause', 'bogus'];

/** Scope cases in plain data: `kind` plus the value it carries. */
const SCOPES = [
    ...['test', 'authenticated', 'unauthenticated', 'something-else', ''].map((value) => ({ label: `string '${value}'`, kind: 'string', value })),
    { label: 'Mat class', kind: 'matClass' },
    { label: 'mat null', kind: 'mat', value: null },
    ...Object.entries(MATS).map(([label, mat]) => ({ label, kind: 'mat', value: mat })),
    { label: 'match null', kind: 'match', value: null },
    ...Object.entries(MATCHES).map(([label, m]) => ({ label, kind: 'match', value: m })),
    { label: 'user null', kind: 'user', value: null },
    { label: 'user other', kind: 'user', value: { id: USERS.other } },
];

const CELLS = Object.keys(SUBJECT_USERS).length * Object.keys(MAT_CODES).length * SCOPES.length * ACTIONS.length;

const matById = (id) => Object.values(MATS).find((m) => m.id === id) ?? null;

/**
 * Every grid record. `evaluate(userId, code, scope, action)` returns 'GRANT',
 * 'deny' or 'THROW <class>: <message>'.
 */
async function recordGrid(evaluate) {
    const legend = {};
    const symbol = (outcome) => {
        if (outcome === 'GRANT') return 'G';
        if (outcome === 'deny') return 'd';
        let found = Object.entries(legend).find(([, text]) => text === outcome);
        if (!found) {
            found = [String(Object.keys(legend).length + 1), outcome];
            if (found[0].length > 1) throw new Error('too many distinct errors for one-character symbols');
            legend[found[0]] = outcome;
        }
        return found[0];
    };
    const subjects = [];
    for (const [userLabel, userId] of Object.entries(SUBJECT_USERS)) {
        for (const [codeLabel, code] of Object.entries(MAT_CODES)) {
            const rows = [];
            for (const scope of SCOPES) {
                let row = '';
                for (const action of ACTIONS) row += symbol(await evaluate(userId, code, scope, action));
                rows.push(row);
            }
            subjects.push({ key: `${userLabel}/${codeLabel}`, rows });
        }
    }
    return [{ key: 'axes', users: Object.keys(SUBJECT_USERS), codes: Object.keys(MAT_CODES), scopes: SCOPES.map((s) => s.label), actions: ACTIONS, legend }, ...subjects];
}

async function outcome(fn) {
    try {
        return (await fn()) ? 'GRANT' : 'deny';
    } catch (err) {
        return `THROW ${err?.constructor?.name}: ${err?.message}`;
    }
}

/** The current permission rules (src/http/permissions) as an `evaluate` function. */
function currentRules() {
    const { can } = require('../../src/http/permissions'); // eslint-disable-line global-require
    const loaders = {
        matchJudges: async (match) => Object.values(MATCHES).find((m) => m.id === match.id).judges.map((id) => ({ id })),
        matchMat:    async (match) => matById(match.mat_id),
    };
    const scopeOf = (s) => {
        switch (s.kind) {
            case 'string':   return { kind: 'string', value: s.value };
            case 'matClass': return { kind: 'matClass' };
            case 'mat':      return { kind: 'mat', mat: s.value };
            case 'match':    return { kind: 'match', match: s.value && { id: s.value.id, mat_id: s.value.mat_id } };
            case 'user':     return { kind: 'user', user: s.value };
            default: throw new Error(s.kind);
        }
    };
    return (userId, code, scope, action) => outcome(() => can({ user: userId ? { id: userId } : null, matCode: code }, action, scopeOf(scope), loaders));
}

export { ACTIONS, CELLS, MATCHES, MATS, MAT_CODES, SCOPES, SUBJECT_USERS, USERS, currentRules, matById, outcome, recordGrid };
