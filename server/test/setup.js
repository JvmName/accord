/**
 * Global test setup, preloaded by `bunfig.toml`.
 *
 * Replaces Jest's `setupFilesAfterEach: ["jest-extended/all"]`.
 *
 * Only ONE jest-extended matcher is actually used by this suite:
 * `toHaveBeenCalledBefore` (8 uses in test/server/applicationServer.test.js).
 * `bun:test` does not ship it, so it is re-implemented here with the same
 * semantics as jest-extended: compare the FIRST invocation order of each mock.
 * Every other matcher in use is core Jest and is natively supported by bun.
 */
const { expect } = require('bun:test');


// ---------------------------------------------------------------------------
// Disable pino's worker-thread transport for the duration of the test run.
//
// `lib/logger.js` configures `transport: { target: 'pino-pretty' }`, which
// spawns a `thread-stream` worker. `bun test --isolate` tears down each test
// file's global when the file finishes, which kills that worker; thread-stream
// then emits "the worker thread exited" and bun reports it as an unhandled
// error between tests. Stripping `transport` keeps the logger fully functional
// (same levels, same call sites) without a worker thread.
//
// This mutates only the test process's module cache — `lib/logger.js` is not
// touched. It has to go through `require.cache` because `pino`'s CJS export is
// a function, and bun's `mock.module()` can only produce namespace objects.
// ---------------------------------------------------------------------------
const pinoPath = require.resolve('pino');
const realPino = require('pino');

function pinoWithoutTransport(options = {}, stream) {
    const { transport, ...rest } = options || {};
    return realPino(rest, stream);
}
Object.assign(pinoWithoutTransport, realPino);
pinoWithoutTransport.pino    = pinoWithoutTransport;
pinoWithoutTransport.default = pinoWithoutTransport;

require.cache[pinoPath].exports = pinoWithoutTransport;


function invocationCallOrder(mockFn, matcherName) {
    if (!mockFn || !mockFn.mock || !Array.isArray(mockFn.mock.invocationCallOrder)) {
        throw new Error(`${matcherName}: received value must be a mock or spy function`);
    }
    return mockFn.mock.invocationCallOrder;
}


// Mirrors jest-extended's predicate exactly.
function calledBefore(firstOrder, secondOrder, failIfNoFirstInvocation) {
    if (firstOrder.length === 0)  return !failIfNoFirstInvocation;
    if (secondOrder.length === 0) return false;
    return firstOrder[0] < secondOrder[0];
}


expect.extend({
    toHaveBeenCalledBefore(actual, expected, failIfNoFirstInvocation = true) {
        const firstOrder  = invocationCallOrder(actual,   'toHaveBeenCalledBefore');
        const secondOrder = invocationCallOrder(expected, 'toHaveBeenCalledBefore');

        const pass = calledBefore(firstOrder, secondOrder, failIfNoFirstInvocation);

        return {
            pass,
            message: () => pass
                ? 'expected mock not to have been called before the other mock, but it was'
                : 'expected mock to have been called before the other mock, but it was not',
        };
    },
});
