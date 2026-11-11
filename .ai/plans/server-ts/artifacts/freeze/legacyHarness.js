/**
 * Task 15a freeze tooling (temporary; runs only while the legacy stack exists).
 *
 * Shared setup for the freeze scripts: NODE_ENV=test (as under `bun test`),
 * a temp DATABASE_PATH, the LEGACY migrations (lib/activeRecord migrator, the
 * same code test/helpers/httpServer.js#migrate ran before 15a), and the legacy
 * Sequelize seed (a verbatim copy of test/contract/seed.ts as of 6a55eae, with
 * only its model require paths rewritten). Never points Sequelize at a
 * Drizzle-baseline DB (F-47).
 *
 * Must be required FIRST by every freeze script.
 */
const fs   = require('fs');
const os   = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
const SERVER = path.resolve(__dirname, '../../../../../server');

function useTemporaryDatabase(label) {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`)), 'database.sqlite');
    process.env.DATABASE_PATH = file;
    return file;
}

/** Verbatim logic of the pre-15a test/helpers/httpServer.js#migrate (legacy migrations, numeric order). */
async function legacyMigrate() {
    const { Migrator } = require(path.join(SERVER, 'lib/activeRecord/db/migrator'));
    const   utils      = require(path.join(SERVER, 'lib/activeRecord/utils'));
    const   versioning = require(path.join(SERVER, 'lib/activeRecord/db/migrationVersion'));
    const migrations = fs.readdirSync(utils.migrationsDirectory)
        .map(fileName => {
            const m = fileName.match(/_(?<version>\d+)(\.(?<databaseId>\w+))?\.js$/);
            return m ? { fileName, databaseId: m.groups.databaseId, version: m.groups.version } : null;
        })
        .filter(Boolean)
        .sort((a, b) => parseInt(a.version) - parseInt(b.version));
    for (const migration of migrations) {
        if (await versioning.migrationHasRun(migration)) continue;
        await Migrator.runMigration(migration);
        await versioning.markVersionAsPerformed(migration);
    }
}

function req(rel) {
    return require(path.join(SERVER, rel));
}

/** Writes JSONL through the shared encoder; OUT_DIR overrides the target (determinism runs). */
function writeOut(suite, records) {
    const F = req('test/support/frozen');
    const text = F.renderFixture(suite, records);
    const dir = process.env.FREEZE_OUT_DIR || F.FIXTURE_DIR;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${suite}.jsonl`), text);
    console.log(`wrote ${path.join(dir, `${suite}.jsonl`)} (${records.length} records, ${text.length} bytes)`);
}

module.exports = { SERVER, legacyMigrate, req, useTemporaryDatabase, writeOut };
