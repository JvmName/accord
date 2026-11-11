/**
 * Task 15a freeze script: records the `webSocketTier` fixture from the LEGACY
 * Socket.IO tier (lib/server/{webSocketServer,webSocket,...}) and the legacy
 * model lookups, on a legacy-migrated temp DB. Replaces the legacy half of the
 * pre-15a test/ws/webSocketTier.test.js; the scripts are the shared ones in
 * test/ws/webSocketScripts.js.
 *
 *   cd server && bun ../.ai/plans/server-ts/artifacts/freeze/freezeWebSocketTier.js
 */
const X = require('./legacyHarness');
const file = X.useTemporaryDatabase('accord-freeze-ws');
const { Database } = require('bun:sqlite');

const H = X.req('test/services/support');
const W = X.req('test/ws/webSocketScripts');

async function main() {
    await X.legacyMigrate();
    const client = new Database(file);
    H.installAudit(client);
    W.seedRows((table, rows) => H.insertRaw(client, table, rows));
    client.close();

    const { User }  = X.req('models/user');
    const { Match } = X.req('models/match');
    const { WebSocketServer } = X.req('lib/server/webSocketServer');
    const { WebSocket }       = X.req('lib/server/webSocket');

    const server = await W.boot(WebSocketServer, []);
    const records = await W.recordTier({
        origin: server.origin,
        WebSocket,
        host: { emit() {} },
        findUser: (value) => User.findByApiToken(value),
        findMatch: (value) => Match.find(value),
    });
    server.close();
    X.writeOut('webSocketTier', records);
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
