/**
 * Task 15a freeze script: records the `emissions` fixture from the LEGACY jobs
 * (lib/workerQueue) and legacy models on a legacy-migrated temp DB. Replaces
 * the legacy half of the pre-15a test/workers/emissionDifferential.test.js; the
 * timelines are the shared ones in test/workers/emissionScenarios.js.
 * Also prints the legacy statement counts of the "all at once" scenario.
 *
 *   cd server && bun ../.ai/plans/server-ts/artifacts/freeze/freezeEmissions.js
 */
const X = require('./legacyHarness');
const file = X.useTemporaryDatabase('accord-freeze-emissions');

const H = X.req('test/services/support');
const E = X.req('test/workers/emissionScenarios');

async function main() {
    await X.legacyMigrate();
    const L = {
        Match: X.req('models/match').Match,
        TechFallTrackerWorker: X.req('lib/workerQueue/techFallTrackerWorker').TechFallTrackerWorker,
        MatchUpdateWorker:     X.req('lib/workerQueue/matchUpdateWorker').MatchUpdateWorker,
        BreakTransitionWorker: X.req('lib/workerQueue/breakTransitionWorker').BreakTransitionWorker,
        RoundTimerWorker:      X.req('lib/workerQueue/roundTimerWorker').RoundTimerWorker,
    };
    const client = H.fileClient(file);
    E.insertBase(client);
    const snapshot = H.snapshot(client);

    // Pre-15a ACTIONS.*.legacy
    const actions = {
        pause:      async (id) => (await (await L.Match.find(id)).getLastRound()).pause(),
        resume:     async (id) => (await (await L.Match.find(id)).getLastRound()).resume(),
        startMatch: async (id) => (await L.Match.find(id)).start(),
        endMatch:   async (id) => (await L.Match.find(id)).end(),
    };

    const sequelize = L.Match.sequelize;
    const totals = {};
    const records = [];
    for (const scenario of E.SCENARIOS) {
        const known = E.loadScenario(client, snapshot, scenario);
        const make = (Cls) => new Cls('differential-worker');
        const workers = {
            techFall:        make(L.TechFallTrackerWorker),
            breakTransition: make(L.BreakTransitionWorker),
            roundTimer:      make(L.RoundTimerWorker),
            matchUpdate:     make(L.MatchUpdateWorker),
        };
        if (scenario.name.startsWith('all at once: concurrent')) {
            for (const [job, w] of Object.entries(workers)) {
                const perform = w.performJob.bind(w);
                w.performJob = async () => {
                    const previous = sequelize.options.logging;
                    sequelize.options.logging = () => { totals[job] = (totals[job] || 0) + 1; };
                    try { return await perform(); } finally { sequelize.options.logging = previous; }
                };
            }
        }
        const timeline = await E.runTimeline({ client, workers, actions }, scenario);
        records.push(...E.encodeTimeline(scenario.name, timeline, known));
    }
    X.writeOut('emissions', records);
    console.log('legacy statements, "all at once" scenario, per job:', JSON.stringify(totals));
    client.close();
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
