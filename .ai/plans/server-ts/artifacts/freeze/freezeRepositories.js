/**
 * Task 15a freeze script: records the `repositories` fixture from the LEGACY
 * models (the oracle side of the pre-15a test/db/repositories/differential.test.js)
 * on a legacy-migrated temp DB seeded by the legacy Sequelize seed.
 *
 *   cd server && bun ../.ai/plans/server-ts/artifacts/freeze/freezeRepositories.js
 */
const X = require('./legacyHarness');
const file = X.useTemporaryDatabase('accord-freeze-repositories');
const { setSystemTime } = require('bun:test');
const { Database } = require('bun:sqlite');

const D  = X.req('test/support/rowDelta');
const Q  = X.req('test/db/repositories/differentialQueries');

async function main() {
    await X.legacyMigrate();
    const seedModule = require('./legacySeed.ts');
    await seedModule.seed({ set: (ms) => setSystemTime(new Date(ms)) });
    setSystemTime();

    const legacy = {
        User:    X.req('models/user').User,
        Mat:     X.req('models/mat').Mat,
        MatCode: X.req('models/matCode').MatCode,
        Match:   X.req('models/match').Match,
        Round:   X.req('models/round').Round,
    };
    const client = new Database(file, { readonly: true });
    const seedRows = D.dumpRows(client);
    client.close();
    const labels = D.seedLabels(seedRows, new Set(Object.values(seedModule.IDS)));

    // The legacy calls of the pre-15a differential test; Sequelize instances -> plain values.
    const plain = (r) => (r == null ? r : r.get({ plain: true }));
    const plainAll = (rs) => rs.map(plain);
    const reader = {
        async matchGraph(id) {
            const match = await legacy.Match.find(id);
            const rounds = [];
            for (const round of await match.getRounds()) {
                rounds.push({ round: plain(round), ridingTimeVotes: plainAll(await round.getRidingTimeVotes()), pauses: plainAll(await round.getPauses()) });
            }
            return {
                match: plain(match), mat: plain(await match.getMat()),
                redCompetitor: plain(await match.getRedCompetitor()), blueCompetitor: plain(await match.getBlueCompetitor()),
                judges: plainAll(await match.getJudges()), rounds,
            };
        },
        openRounds: async () => plainAll(await legacy.Round.getOpenRounds()),
        matchesInBreak: async () => plainAll(await legacy.Match.where({ break_started_at: { [legacy.Match.Operators.ne]: null }, ended_at: null })),
        async matchHelpers(id, judgeIds) {
            const match = await legacy.Match.find(id);
            const rounds = [];
            for (const round of await match.getRounds()) {
                const openVoteFor = [];
                for (const judgeId of judgeIds) openVoteFor.push(plain(await round.currentRidingTimeVoteForJudge({ id: judgeId })));
                rounds.push({
                    round: plain(round),
                    openVotes: plainAll(await round.getRidingTimeVotes({ where: { ended_at: null } })),
                    currentPause: plain(await round.getCurrentPause()),
                    openVoteFor,
                });
            }
            return { lastRound: plain(await match.getLastRound()), judges: plainAll(await match.getJudges()), rounds };
        },
        async mat(id, viewerId, nonViewerId) {
            const mat = await legacy.Mat.find(id);
            return {
                mat: plain(mat),
                judges: plainAll(await mat.getJudges()),
                viewers: plainAll(await mat.getViewers()),
                codes: plainAll(await mat.getMatCodes()),
                incompleteMatches: plainAll(await mat.getIncompleteMatches()),
                viewerFiltered: plainAll(await mat.getViewers({ where: { id: viewerId } })),
                nonViewerFiltered: plainAll(await mat.getViewers({ where: { id: nonViewerId } })),
            };
        },
        userByApiToken: async (token) => plain(await legacy.User.findByApiToken(token)),
        userById: async (id) => plain(await legacy.User.find(id)),
        matCodeByCode: async (code) => plain(await legacy.MatCode.findByCode(code)),
        matByCode: async (code) => plain(await legacy.Mat.findByCode(code)),
        codeRegexp: legacy.MatCode.CODE_REGEXP,
    };

    const records = await Q.recordQueries(seedModule, reader, Q.rowEncoder(seedRows, labels));
    X.writeOut('repositories', records);
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
