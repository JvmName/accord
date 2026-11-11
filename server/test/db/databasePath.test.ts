import { afterEach, describe, expect, it } from 'bun:test';
import path from 'path';
import { resolveDatabasePath } from '../../src/db';

const saved = { DATABASE_PATH: process.env.DATABASE_PATH, NODE_ENV: process.env.NODE_ENV };

afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});

describe('resolveDatabasePath', () => {
    it('uses DATABASE_PATH when set', () => {
        process.env.DATABASE_PATH = '/data/accord.sqlite';
        process.env.NODE_ENV = 'production';
        expect(resolveDatabasePath()).toBe('/data/accord.sqlite');
    });

    it('falls back to config/db/database.<NODE_ENV>.sqlite under the working directory', () => {
        delete process.env.DATABASE_PATH;
        process.env.NODE_ENV = 'test';
        expect(resolveDatabasePath()).toBe(path.join(process.cwd(), 'config', 'db', 'database.test.sqlite'));
    });

    it('defaults NODE_ENV to development', () => {
        delete process.env.DATABASE_PATH;
        delete process.env.NODE_ENV;
        expect(resolveDatabasePath()).toBe(path.join(process.cwd(), 'config', 'db', 'database.development.sqlite'));
    });
});
