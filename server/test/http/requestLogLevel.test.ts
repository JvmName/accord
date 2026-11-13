import { describe, expect, it } from 'bun:test';
import { requestLogLevel } from '../../src/http/server';

describe('requestLogLevel', () => {
    it('logs by the response status', () => {
        expect(requestLogLevel({ statusCode: 200 })).toBe('info');
        expect(requestLogLevel({ statusCode: 304 })).toBe('info');
        expect(requestLogLevel({ statusCode: 400 })).toBe('warn');
        expect(requestLogLevel({ statusCode: 404 })).toBe('warn');
        expect(requestLogLevel({ statusCode: 500 })).toBe('error');
    });

    it('logs a request that errored as an error whatever its status', () => {
        expect(requestLogLevel({ statusCode: 200 }, new Error('boom'))).toBe('error');
    });
});
