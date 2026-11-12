/**
 * Global test setup, preloaded by `bunfig.toml`.
 *
 * Adds `toHaveBeenCalledBefore` (used by the worker characterization tests).
 * `bun:test` does not ship it, so it is implemented here with the same
 * semantics as jest-extended: compare the FIRST invocation order of each mock.
 * Every other matcher in use is core Jest and is natively supported by bun.
 */
import { expect } from 'bun:test';

declare module 'bun:test' {
    interface Matchers<T> {
        /** Compares the first invocation of two mocks; see the matcher below. */
        toHaveBeenCalledBefore(other: unknown, failIfNoFirstInvocation?: boolean): void;
    }
}


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
