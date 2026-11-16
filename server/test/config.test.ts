import { describe, expect, it } from 'bun:test';
import { ConfigError, loadConfig } from '../src/config';

describe('loadConfig', () => {
    it('applies the defaults to an empty environment', () => {
        expect(loadConfig({})).toEqual({
            NODE_ENV: 'development', PORT: 3000, HOST: 'localhost', LOG_LEVEL: 'info', PROC_NAME: 'SERVER',
        });
    });

    it('parses and lower-cases the values it is given', () => {
        const config = loadConfig({
            NODE_ENV: 'production', PORT: '8080', DATABASE_PATH: '/data/a.sqlite', WEB_ORIGIN: 'https://web.example',
            WORKER_TOKEN: 'secret', LOG_LEVEL: 'DEBUG', ACCORD_VALIDATE_WIRE: '1',
        });
        expect(config).toMatchObject({
            NODE_ENV: 'production', PORT: 8080, DATABASE_PATH: '/data/a.sqlite', WEB_ORIGIN: 'https://web.example',
            WORKER_TOKEN: 'secret', LOG_LEVEL: 'debug', ACCORD_VALIDATE_WIRE: '1',
        });
    });

    it('treats an empty variable as unset', () => {
        const config = loadConfig({ PORT: '', WEB_ORIGIN: '' });
        expect(config.PORT).toBe(3000);
        expect(config.WEB_ORIGIN).toBeUndefined();
    });

    it('names every invalid variable in the error', () => {
        let error: unknown;
        try {
            loadConfig({ PORT: 'eighty', WEB_ORIGIN: 'not a url', ACCORD_OPENAPI_VALIDATION: 'maybe' });
        } catch (err) {
            error = err;
        }
        expect(error).toBeInstanceOf(ConfigError);
        const message = (error as ConfigError).message;
        expect(message).toContain('PORT');
        expect(message).toContain('WEB_ORIGIN');
        expect(message).toContain('ACCORD_OPENAPI_VALIDATION');
        expect((error as ConfigError).issues.map(issue => issue.variable).sort()).toEqual(['ACCORD_OPENAPI_VALIDATION', 'PORT', 'WEB_ORIGIN']);
    });

    it('rejects a port outside 1-65535', () => {
        expect(() => loadConfig({ PORT: '70000' })).toThrow(/PORT/);
        expect(() => loadConfig({ PORT: '0' })).toThrow(/PORT/);
    });
});
