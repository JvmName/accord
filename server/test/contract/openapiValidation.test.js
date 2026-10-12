/**
 * The DEV OpenAPI validator against the requests the real client sends.
 *
 * Replays the whole capture plan with request AND response validation on and
 * requires every golden whose expected status is below 400 (and every
 * WebSocket golden) to come back byte-identical: the validator must not
 * reject a request the client sends, and every response the server sends on
 * those paths must match the generated document.
 *
 * Error goldens are replayed too but not compared: for an invalid request the
 * validator answers with its own 400/401 page, which is expected to differ
 * from the application's envelope.
 */
const { afterAll, beforeAll, describe, expect, it, jest } = require('bun:test');
const Http = require('../helpers/httpServer');

// Before any module opens a database connection.
Http.useTemporaryDatabase('accord-openapi-validation');

const { readGolden, runAll, serializeGolden } = require('./capture.ts');
const { generateOpenApiDocument } = require('../../src/contract/openapi');
const { OPENAPI_VALIDATION_ENV } = require('../../src/http/server');

const clock = { set: ms => jest.setSystemTime(new Date(ms)) };

let result;
const previous = process.env[OPENAPI_VALIDATION_ENV];

beforeAll(async () => {
    process.env[OPENAPI_VALIDATION_ENV] = '1';
    result = await runAll(clock);
}, 120000);

afterAll(() => {
    jest.useRealTimers();
    if (previous === undefined) delete process.env[OPENAPI_VALIDATION_ENV];
    else process.env[OPENAPI_VALIDATION_ENV] = previous;
});

function expectedStatus(goldenText) {
    return JSON.parse(goldenText).response?.status ?? null;
}

describe('OpenAPI validator: client requests', () => {
    it('validates against a document with operations, mounted at the root', () => {
        const document = generateOpenApiDocument();
        expect(document.servers).toEqual([{ url: '/', description: 'API server' }]);
        expect(Object.keys(document.paths).length).toBeGreaterThanOrEqual(15);
    });

    it('passes every success golden through unchanged (no rejection, no response error)', () => {
        const changed = [];
        let checked = 0;
        for (const record of result.records) {
            const golden = readGolden(record.name);
            const status = expectedStatus(golden);
            if (status !== null && status >= 400) continue;
            checked++;
            if (serializeGolden(record) !== golden) changed.push(record.name);
        }
        expect(changed).toEqual([]);
        expect(checked).toBeGreaterThanOrEqual(40);
    });

    it('is actually running: a request the document forbids gets the validator\'s own answer', () => {
        const record = result.records.find(r => r.name === 'http.users.create.missingName.400');
        expect(record.body.response.status).toBe(400);
        expect(record.body.response.content_type).toStartWith('text/html');
    });
});

describe('OpenAPI validator: DEV routes', () => {
    let booted;
    let request;

    beforeAll(async () => {
        booted  = await Http.startServer({ serverOptions: { dev: true, openApiValidation: true } });
        request = Http.makeClient(booted.origin);
    }, 30000);

    afterAll(() => booted?.server.close());

    it('still serves the root and the docs routes', async () => {
        expect(booted.server.openApiValidation).toBe(true);

        const root = await request('GET', '/');
        expect(root.status).toBe(200);
        expect(root.body.status).toBe('ok');

        const docs = await request('GET', '/docs');
        expect(docs.status).toBe(200);
        expect(docs.body).toContain('<title>API Docs</title>');

        const docsJson = await request('GET', '/docs.json');
        expect(docsJson.status).toBe(200);
        expect(docsJson.body).toEqual(JSON.parse(JSON.stringify(generateOpenApiDocument())));

        const asyncDocs = await request('GET', '/async-docs.json');
        expect(asyncDocs.status).toBe(200);
        expect(asyncDocs.body.asyncapi).toBe('2.6.0');
    });
});
