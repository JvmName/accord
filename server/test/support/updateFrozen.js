/**
 * Regenerates the snapshot fixtures in test/fixtures/frozen from the CURRENT
 * implementation. Run it on purpose, after a deliberate behavior change, and
 * review the diff before committing it:
 *
 *   bun run test:update-fixtures           # rewrite every fixture
 *   bun run test:update-fixtures --check   # only report which ones would change
 *   bun run test:update-fixtures seed lifecycle   # only these
 *
 * On an unchanged implementation it rewrites every file byte for byte.
 */
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const { setSystemTime } = require('bun:test');

const F = require('./frozen');
const D = require('./rowDelta');
const H = require('../services/support');

const clock = { set: (ms) => setSystemTime(new Date(ms)) };

/** A seeded in-memory database with the audit triggers, and its seed rows and labels. */
async function seededDb() {
    const seedModule = require('../contract/seed.ts');
    const db = H.modernDb();
    await seedModule.seed(clock, db);
    setSystemTime();
    const rows = D.dumpRows(db.$client);
    return { db, seedModule, rows, labels: D.seedLabels(rows, new Set(Object.values(seedModule.IDS))) };
}

const SUITES = {
    async seed() {
        const { db, rows, labels } = await seededDb();
        db.$client.close();
        const records = [];
        for (const t of H.TABLES) for (const { __rowid, ...row } of rows[t]) records.push({ key: `${t}:${__rowid}`, row: D.relabel(row, labels) });
        return records;
    },

    async lifecycle() {
        const LS = require('../services/lifecycleScenarios');
        const { db, seedModule, labels } = await seededDb();
        const snapshot = H.snapshot(db.$client);
        const stepsImpl = LS.modernSteps(db);
        const records = [];
        for (const scenario of Object.values(LS.buildScenarios(seedModule).scenarios)) {
            records.push((await LS.runScenario({ client: db.$client, snapshot, labels, stepsImpl }, scenario)).record);
        }
        db.$client.close();
        return records;
    },

    async emissions() {
        const E = require('../workers/emissionScenarios');
        const db = H.modernDb();
        E.insertBase(db.$client);
        const snapshot = H.snapshot(db.$client);
        const records = [];
        for (const scenario of E.SCENARIOS) {
            const known = E.loadScenario(db.$client, snapshot, scenario);
            const timeline = await E.runTimeline({ client: db.$client, workers: E.modernWorkers(db), actions: E.modernActions(db) }, scenario);
            records.push(...E.encodeTimeline(scenario.name, timeline, known));
        }
        db.$client.close();
        return records;
    },

    async repositories() {
        const Q = require('../db/repositories/differentialQueries');
        const { db, seedModule, rows, labels } = await seededDb();
        const records = await Q.recordQueries(seedModule, Q.repositoryReader(db), Q.rowEncoder(rows, labels));
        db.$client.close();
        return records;
    },

    async webSocketTier() {
        const W = require('../ws/webSocketScripts');
        const { createDb, migrateDb } = require('../../src/db');
        const db = createDb({ path: ':memory:' });
        migrateDb(db);
        H.installAudit(db.$client);
        W.seedRows((table, rows) => H.insertRaw(db.$client, table, rows));
        const tier = await W.modernTier(db);
        try {
            return await W.recordTier(tier);
        } finally {
            tier.close();
        }
    },

    async permissions() {
        const G = require('../http/permissionGrid');
        return await G.recordGrid(G.currentRules());
    },

    async errorRendering() {
        const { ERROR_CASES } = require('../http/errorCases');
        const { startRegistryApp } = require('../http/support/registryApp');
        const { routeResponses } = require('../../src/contract/responses');
        const { defineRoute } = require('../../src/http/route');
        const { AuthorizationError, ValidationError } = require('../../src/http/errors');
        let thrown;
        const probe = defineRoute({
            method: 'get', path: '/__probe', authorize: { scope: 'none', level: 'public' },
            response: routeResponses['GET /system/healthCheck'], tags: ['test'],
            handler: async () => { throw thrown; },
        });
        const app = await startRegistryApp({ routes: [probe] });
        try {
            const records = [];
            for (const c of ERROR_CASES) {
                thrown = c.make({ AuthorizationError, ValidationError });
                const res = await fetch(`${app.origin}/__probe`);
                records.push({ key: c.label, status: res.status, body: await res.json() });
            }
            return records;
        } finally {
            app.close();
        }
    },
};

async function main() {
    const args = process.argv.slice(2);
    const check = args.includes('--check');
    const only = args.filter((a) => !a.startsWith('--'));
    const unknown = only.filter((name) => !SUITES[name]);
    if (unknown.length) throw new Error(`unknown fixture(s): ${unknown.join(', ')}; known: ${Object.keys(SUITES).join(', ')}`);
    const outDir = process.env.FROZEN_OUT_DIR || F.FIXTURE_DIR;
    let changed = 0;
    for (const name of only.length ? only : Object.keys(SUITES)) {
        const text = F.renderFixture(name, await SUITES[name]());
        const file = path.join(outDir, `${name}.jsonl`);
        const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
        const same = before === text;
        if (!same) changed++;
        if (!check && !same) {
            fs.mkdirSync(outDir, { recursive: true });
            fs.writeFileSync(file, text);
        }
        console.log(`${same ? 'unchanged' : check ? 'WOULD CHANGE' : 'updated'}  ${path.relative(process.cwd(), file)}  (${text.split('\n').length - 2} records, ${text.length} bytes)`);
    }
    return check && changed ? 1 : 0;
}

main().then((code) => process.exit(code), (err) => { console.error(err); process.exit(2); });

