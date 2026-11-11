/**
 * Task 15a freeze script: records the `errorRendering` fixture from the LEGACY
 * dispatch (LegacyControllerDispatch#requestHandler -> handleError, the
 * `ApplicationServer` alias in lib/server/applicationServer.js), exactly as the
 * legacy half of the pre-15a test/http/envelope.test.ts drove it.
 *
 *   cd server && bun ../.ai/plans/server-ts/artifacts/freeze/freezeErrorRendering.js
 */
const X = require('./legacyHarness');
X.useTemporaryDatabase('accord-freeze-errors');

const { ERROR_CASES } = X.req('test/http/errorCases');

async function main() {
    const { LegacyControllerDispatch } = X.req('lib/server/applicationServer');
    const legacy = X.req('lib/server/serverController');
    // Verbatim copy of the pre-15a test/helpers/express.js doubles (deleted in 15a with its last users).
    const { jest } = require('bun:test');
    const makeRequest = ({ headers = {}, params = {}, body = {}, query = {} } = {}) => ({ headers, params, body, query });
    const makeResponse = () => {
        const res = { statusCode: 200, headers: {} };
        res.json = jest.fn(body => { res._body = body; });
        res.set  = jest.fn();
        res.send = jest.fn();
        res.end  = jest.fn();
        return res;
    };

    async function legacyRender(err) {
        class ThrowingController extends legacy.ServerController {
            async getProbe() { throw err; }
        }
        const server   = new LegacyControllerDispatch();
        const response = makeResponse();
        await server.requestHandler('getProbe', ThrowingController)(makeRequest(), response);
        return { status: response.statusCode, body: JSON.parse(JSON.stringify(response._body)) };
    }

    const records = [];
    for (const c of ERROR_CASES) records.push({ key: c.label, ...(await legacyRender(c.make(legacy))) });
    X.writeOut('errorRendering', records);
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
