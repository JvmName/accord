import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
/** users repository against a real in-memory SQLite DB. */
import { ID, freshDb, seedBase } from './support';
import * as Users from '../../../src/db/repositories/users';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let db;
beforeEach(() => { db = freshDb(); seedBase(db); });
afterEach(() => db.$client.close());

describe('findUserById', () => {
    it('returns the row with Date timestamps', async () => {
        const user = await Users.findUserById(db, ID.judgeA);
        expect(user).toEqual({
            id: ID.judgeA, name: 'Jordan Judge', api_token: ID.tokenJudgeA,
            created_at: new Date('2026-01-01T12:00:01.000Z'), updated_at: new Date('2026-01-01T12:00:01.000Z'),
        });
    });

    it('returns null (not undefined) when not found', async () => {
        expect(await Users.findUserById(db, 'nope')).toBeNull();
    });

    it('returns null for a nullish id, like findByPk', async () => {
        expect(await Users.findUserById(db, undefined)).toBeNull();
        expect(await Users.findUserById(db, null)).toBeNull();
    });
});

describe('findUserByApiToken (auth lookup)', () => {
    it('finds the user owning the token', async () => {
        expect((await Users.findUserByApiToken(db, ID.tokenCreator))!.id).toBe(ID.creator);
    });

    it('returns null for an unknown token', async () => {
        expect(await Users.findUserByApiToken(db, 'not-a-token')).toBeNull();
    });

    it('is exact and case-sensitive (BINARY collation)', async () => {
        expect(await Users.findUserByApiToken(db, ID.tokenCreator.toUpperCase())).toBeNull();
        expect(await Users.findUserByApiToken(db, `${ID.tokenCreator} `)).toBeNull();
        expect(await Users.findUserByApiToken(db, ID.tokenCreator.slice(0, -1))).toBeNull();
    });

    it('returns null for a null token', async () => {
        expect(await Users.findUserByApiToken(db, null)).toBeNull();
    });

    it('throws for an undefined token', async () => {
        await expect(Users.findUserByApiToken(db, undefined))
            .rejects.toThrow('WHERE parameter "api_token" has invalid "undefined" value');
    });
});

describe('insertUser', () => {
    it('generates id and api_token and stamps created_at = updated_at', async () => {
        const before = Date.now();
        const user = await Users.insertUser(db, { name: 'New Person' });
        expect(user.id).toMatch(UUID_RE);
        expect(user.api_token).toMatch(UUID_RE);
        expect(user.created_at).toBeInstanceOf(Date);
        expect(user.created_at.getTime()).toBeGreaterThanOrEqual(before);
        expect(user.updated_at).toEqual(user.created_at);
        expect(await Users.findUserById(db, user.id)).toEqual(user);
    });

    it('keeps a given api_token and regenerates a falsy one', async () => {
        expect((await Users.insertUser(db, { name: 'a', api_token: 'given' })).api_token).toBe('given');
        expect((await Users.insertUser(db, { name: 'b', api_token: '' })).api_token).toMatch(UUID_RE);
        expect((await Users.insertUser(db, { name: 'c', api_token: null })).api_token).toMatch(UUID_RE);
    });

    it('rejects a duplicate api_token (unique index)', async () => {
        await expect(Users.insertUser(db, { name: 'dup', api_token: ID.tokenCreator })).rejects.toThrow(/UNIQUE/);
    });
});
