/**
 * Real-HTTP test harness.
 *
 * Boots an actual `ApplicationServer` on a free port against a throwaway
 * SQLite database under $TMPDIR, so tests can drive the server the way a client
 * does — with `fetch` — rather than through internal classes.
 *
 * Used by test/characterization/authorization.test.js, whose whole point is to
 * state the authorization matrix WITHOUT coupling to `Authorizer`, so that the
 * same assertions still run after task 15 deletes that class.
 *
 * Two deliberate choices:
 *
 * 1. `DATABASE_PATH` is set before anything can open a connection, so
 *    `config/db/database.test.sqlite` is never touched.
 * 2. Migrations are applied by calling the migration modules directly instead
 *    of running `bin/migrate`, because `migration.runMigrations()` also calls
 *    `generateActiveRecordSchemaFiles()`, which REWRITES the tracked source
 *    file `config/db/schemas/default.js`. A test must not write to source.
 */
const fs   = require('fs');
const net  = require('net');
const os   = require('os');
const path = require('path');


/**
 * Point every connection at a fresh, empty SQLite file. MUST be called before
 * any model module opens a connection (connections are created lazily, so
 * "before the first query" is sufficient, but earliest is safest).
 */
function useTemporaryDatabase(label = 'accord-char') {
    const file = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`)),
        'database.sqlite',
    );
    process.env.DATABASE_PATH = file;
    return file;
}


/**
 * Applies every migration in version order.
 *
 * `fs.readdirSync` is NOT sorted under bun (FINDINGS.md F-04), and migrations
 * are order-dependent, so the explicit numeric sort here is load-bearing.
 */
async function migrate() {
    const { Migrator } = require('../../lib/activeRecord/db/migrator');
    const   utils      = require('../../lib/activeRecord/utils');
    const   versioning = require('../../lib/activeRecord/db/migrationVersion');

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


function freePort() {
    return new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.unref();
        probe.on('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
    });
}


/**
 * Boots an ApplicationServer and resolves once it answers requests.
 *
 * `ApplicationServer#listen()` is fire-and-forget and exposes neither the http
 * server nor a ready promise, so readiness is established by polling the
 * always-registered health check.
 */
async function startServer({ timeoutMs = 10000, serverOptions = {} } = {}) {
    const { ApplicationServer } = require('../../src/http/server');

    const port   = await freePort();
    const server = new ApplicationServer({ ...serverOptions, port });
    const origin = `http://127.0.0.1:${port}`;

    await server.listen();

    const deadline = Date.now() + timeoutMs;
    for (;;) {
        try {
            const res = await fetch(`${origin}/system/healthCheck`);
            if (res.ok) break;
        } catch (err) {
            if (Date.now() > deadline) throw new Error(`server did not come up on ${origin}: ${err.message}`);
        }
        if (Date.now() > deadline) throw new Error(`server did not come up on ${origin}`);
        await new Promise(r => setTimeout(r, 25));
    }

    return { server, origin, port };
}


/**
 * Issues one request and returns `{ status, body }`, where `body` is the parsed
 * JSON envelope (`{ data, status }`) or `null` for an empty response.
 */
function makeClient(origin) {
    return async function request(method, routePath, { token, body, headers = {} } = {}) {
        const init = { method, headers: { ...headers } };

        if (token) init.headers['x-api-token'] = token;
        if (body !== undefined) {
            init.headers['content-type'] = 'application/json';
            init.body = JSON.stringify(body);
        }

        const res  = await fetch(`${origin}${routePath}`, init);
        const text = await res.text();

        let parsed = null;
        if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }

        return { status: res.status, body: parsed };
    };
}


module.exports = {
    freePort,
    makeClient,
    migrate,
    startServer,
    useTemporaryDatabase,
};
