/**
 * Task 15a freeze script: records the `seed` and `lifecycle` fixtures from the
 * LEGACY stack (models/, lib/workerQueue) on a legacy-migrated temp DB seeded
 * by the legacy Sequelize seed. Replaces the legacy half of the pre-15a
 * test/services/lifecycleParity.test.js; the scenarios are the shared ones in
 * test/services/lifecycleScenarios.js, run here through the legacy calls the
 * parity test made.
 *
 *   bun .ai/plans/server-ts/artifacts/freeze/freezeLifecycle.js
 */
const X = require('./legacyHarness');
const file = X.useTemporaryDatabase('accord-freeze-lifecycle');
const { setSystemTime } = require('bun:test');

const H  = X.req('test/services/support');
const D  = X.req('test/support/rowDelta');
const LS = X.req('test/services/lifecycleScenarios');

async function main() {
    await X.legacyMigrate();
    const seedModule = require('./legacySeed.ts');
    await seedModule.seed({ set: (ms) => setSystemTime(new Date(ms)) });
    setSystemTime();

    const L = {
        Match: X.req('models/match').Match,
        Round: X.req('models/round').Round,
        User:  X.req('models/user').User,
        TechFallTrackerWorker: X.req('lib/workerQueue/techFallTrackerWorker').TechFallTrackerWorker,
        RoundTimerWorker:      X.req('lib/workerQueue/roundTimerWorker').RoundTimerWorker,
        BreakTransitionWorker: X.req('lib/workerQueue/breakTransitionWorker').BreakTransitionWorker,
    };
    const client = H.fileClient(file);
    const snapshot = H.snapshot(client);
    const seedRows = D.dumpRows(client);
    const labels = D.seedLabels(seedRows, new Set(Object.values(seedModule.IDS)));

    // --- seed fixture: every seeded row, in rowid order ---------------------
    const seedRecords = [];
    for (const t of H.TABLES) {
        for (const row of seedRows[t]) {
            const { __rowid, ...values } = row;
            seedRecords.push({ key: `${t}:${__rowid}`, row: D.relabel(values, labels) });
        }
    }
    X.writeOut('seed', seedRecords);

    // --- lifecycle fixture: the legacy calls of the pre-15a parity test ------
    /** Pre-15a runLegacyWorker: the REAL legacy job, restricted to some rounds / matches. */
    async function runLegacyWorker(Cls, { roundIds, matchIds }) {
        const worker = new Cls('parity-worker');
        worker.notifyServer = () => {};
        const origOpen  = L.Round.getOpenRounds;
        const origWhere = L.Match.where;
        if (roundIds) L.Round.getOpenRounds = async function () { return (await origOpen.call(this)).filter((r) => roundIds.includes(r.id)); };
        if (matchIds) L.Match.where = async function (...args) { return (await origWhere.apply(this, args)).filter((m) => matchIds.includes(m.id)); };
        try {
            await worker.performJob();
        } finally {
            L.Round.getOpenRounds = origOpen;
            L.Match.where = origWhere;
        }
    }
    const lastRound = async (matchId) => (await L.Match.find(matchId)).getLastRound();
    const legacySteps = {
        start:      async (s) => { await (await L.Match.find(s.match)).start(); },
        end:        async (s) => { await (await L.Match.find(s.match)).end(); },
        startRound: async (s) => { await (await L.Match.find(s.match)).startRound(); },
        endRound:   async (s) => { await (await L.Match.find(s.match)).endRound(s.opts); },
        workerTechFall:        (s) => runLegacyWorker(L.TechFallTrackerWorker, { roundIds: [s.round] }),
        workerRoundTimer:      (s) => runLegacyWorker(L.RoundTimerWorker, { roundIds: [s.round] }),
        workerBreakTransition: (s) => runLegacyWorker(L.BreakTransitionWorker, { matchIds: [s.match] }),
        pause:     async (s) => { await (await lastRound(s.match)).pause(); },
        resume:    async (s) => { await (await lastRound(s.match)).resume(); },
        setResult: async (s) => { await (await lastRound(s.match)).setResult({ winner: s.winner, stoppage: s.stoppage }); },
        startRidingTime: async (s) => { await (await lastRound(s.match)).startRidingTime(await L.User.find(s.judge), s.rider); },
        endRidingTime:   async (s) => { await (await lastRound(s.match)).endRidingTime(await L.User.find(s.judge), s.rider); },
        endVote: async (s) => { const round = await lastRound(s.match); await (await round.currentRidingTimeVoteForJudge(await L.User.find(s.judge))).end(); },
    };

    const { scenarios } = LS.buildScenarios(seedModule);
    const records = [];
    for (const scenario of Object.values(scenarios)) {
        const { record } = await LS.runScenario({ client, snapshot, labels, stepsImpl: legacySteps }, scenario);
        records.push(record);
    }
    X.writeOut('lifecycle', records);
    client.close();
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
