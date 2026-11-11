/**
 * Task 15a freeze script: records the `permissions` fixture (the 4,320-cell
 * grant/deny grid) from the LEGACY lib/server/authorizer.js, exactly as the
 * legacy half of the pre-15a test/http/permissions.test.ts evaluated it
 * (model instances as scopes, stubbed association getters). No DB access.
 *
 *   cd server && bun ../.ai/plans/server-ts/artifacts/freeze/freezePermissions.js
 */
const X = require('./legacyHarness');
X.useTemporaryDatabase('accord-freeze-permissions');

const G = X.req('test/http/permissionGrid');

async function main() {
    const { Authorizer }   = X.req('lib/server/authorizer');
    const { Mat }          = X.req('models/mat');
    const { Match }        = X.req('models/match');
    const { MatCode }      = X.req('models/matCode');
    const { User }         = X.req('models/user');

    const legacyMatch = (m) => {
        const match = new Match({ id: m.id, mat_id: m.mat_id });
        match.getJudges = async () => m.judges.map((id) => new User({ id }));
        match.getMat    = async () => { const mat = G.matById(m.mat_id); return mat ? new Mat(mat) : null; };
        return match;
    };
    const legacyScope = (s) => {
        switch (s.kind) {
            case 'string':   return s.value;
            case 'matClass': return Mat;
            case 'mat':      return s.value ? new Mat(s.value) : null;
            case 'match':    return s.value ? legacyMatch(s.value) : null;
            case 'user':     return s.value ? new User({ id: s.value.id }) : null;
            default: throw new Error(s.kind);
        }
    };
    const evaluate = (userId, code, scope, action) => {
        const authorizer = new Authorizer(userId ? new User({ id: userId }) : null, code ? new MatCode(code) : undefined);
        return G.outcome(() => authorizer.can(action, legacyScope(scope)));
    };
    const records = await G.recordGrid(evaluate);
    X.writeOut('permissions', records);
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
