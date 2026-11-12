/**
 * Unit tests of the Socket.IO tier's classes (src/ws), with socket doubles:
 * how a client socket initializes, which handlers each socket registers, how
 * the worker socket relays events into match rooms, and how the server wires
 * itself to socket.io. The behavior over real sockets is pinned by
 * ./webSocketTier.test.ts.
 */
import { afterEach, describe, expect, it, jest } from 'bun:test';
import * as IoServer from 'socket.io';
import { createDb, migrateDb } from '../../src/db';
import { insertUser } from '../../src/db/repositories/users';
import { WebSocket } from '../../src/ws/webSocket';
import { WorkerWebSocket } from '../../src/ws/workerWebSocket';
import { WebSocketServer } from '../../src/ws/webSocketServer';

function ioSocketDouble({ apiToken, query = {} }: { apiToken?: string; query?: Record<string, unknown> } = {}) {
    const double = {
        adapter:    { on: jest.fn(), eventNames: jest.fn(() => []), removeAllListeners: jest.fn() },
        eventNames: jest.fn(() => []),
        removeAllListeners: jest.fn(),
        disconnect: jest.fn(),
        id:         'socket-id',
        handshake:  { auth: apiToken === undefined ? {} : { apiToken }, query },
        on:         jest.fn(),
        join:       jest.fn(),
        leave:      jest.fn(),
    };
    // A partial stand-in for socket.io's Socket: only what the code under test touches.
    // `any` so it can be passed where a Socket is expected and still expose its mocks.
    return double as any;
}

function hostWithDb() {
    const db = createDb({ path: ':memory:' });
    migrateDb(db);
    return { emit: jest.fn(), db };
}

afterEach(() => { jest.restoreAllMocks(); });


describe('WebSocket', () => {
    describe('WebSocket#init', () => {
        it('looks the user up by the handshake api token', async () => {
            const host = hostWithDb();
            const user = await insertUser(host.db, { name: 'u', api_token: 'token-1' });
            const socket = new WebSocket(ioSocketDouble({ apiToken: 'token-1' }), host);

            await socket.init();

            expect(socket.currentUser?.id).toBe(user.id);
        });

        it('closes the socket if there is no user', async () => {
            const host = hostWithDb();
            const ioSocket = ioSocketDouble({ apiToken: 'no-such-token' });

            await new WebSocket(ioSocket, host).init();

            expect(ioSocket.disconnect).toHaveBeenCalledTimes(1);
        });

        it('sets up the disconnect, room and match handlers', async () => {
            const host = hostWithDb();
            await insertUser(host.db, { name: 'u', api_token: 'token-1' });
            const socket = new WebSocket(ioSocketDouble({ apiToken: 'token-1' }), host);
            const onSpy = jest.spyOn(socket, 'on');

            await socket.init();

            expect(onSpy).toHaveBeenCalledTimes(5);
            expect(onSpy).toHaveBeenCalledWith('disconnect', expect.any(Function));
            expect(onSpy).toHaveBeenCalledWith('room.join',  expect.any(Function));
            expect(onSpy).toHaveBeenCalledWith('room.leave', expect.any(Function));
            expect(onSpy).toHaveBeenCalledWith('match.join', expect.any(Function));
            expect(onSpy).toHaveBeenCalledWith('match.leave', expect.any(Function));
        });
    });

    describe('WebSocket#on', () => {
        it('calls `on` on the underlying socket with the handler bound to this socket', () => {
            const ioSocket = ioSocketDouble();
            const socket = new WebSocket(ioSocket, { emit: jest.fn(), db: null });
            const handler = jest.fn(function () { return this; });

            socket.on('some.event', handler);

            expect(ioSocket.on).toHaveBeenCalledTimes(1);
            expect(ioSocket.on.mock.calls[0][0]).toBe('some.event');
            expect(ioSocket.on.mock.calls[0][1]()).toBe(socket);
        });
    });

    describe('WebSocket#apiToken', () => {
        it('returns the token from the socket handshake', () => {
            expect(new WebSocket(ioSocketDouble({ apiToken: 'abc' }), { emit: jest.fn(), db: null }).apiToken).toBe('abc');
        });
    });

    describe('WebSocket#id', () => {
        it('returns the socket id', () => {
            expect(new WebSocket(ioSocketDouble(), { emit: jest.fn(), db: null }).id).toBe('socket-id');
        });
    });
});


describe('WorkerWebSocket', () => {
    const relay = (event) => {
        const ioSocket = ioSocketDouble({ query: { workerToken: 'w' } });
        const server = { emit: jest.fn(), db: null };
        const socket = new WorkerWebSocket(ioSocket, server);
        socket.addEventHandlers();
        const [[, handler]] = ioSocket.on.mock.calls.filter(([e]) => e === event);
        const match = { id: 'match-7' };
        handler(match);
        return { server, match };
    };

    it('registers the round.tech-fall, match.update and break.ended handlers', async () => {
        const socket = new WorkerWebSocket(ioSocketDouble({ query: { workerToken: 'w' } }), { emit: jest.fn(), db: null });
        const onSpy = jest.spyOn(socket, 'on');

        await socket.init();

        expect(onSpy).toHaveBeenCalledWith('round.tech-fall', expect.any(Function));
        expect(onSpy).toHaveBeenCalledWith('match.update',    expect.any(Function));
        expect(onSpy).toHaveBeenCalledWith('break.ended',     expect.any(Function));
    });

    for (const event of ['round.tech-fall', 'match.update', 'break.ended']) {
        it(`${event} handler: emits to the match room with the match payload`, () => {
            const { server, match } = relay(event);

            expect(server.emit).toHaveBeenCalledTimes(1);
            expect(server.emit).toHaveBeenCalledWith('match:match-7', event, match);
        });
    }
});


describe('WebSocketServer', () => {
    describe('WebSocketServer#listen', () => {
        it('starts the socket.io server: one handshake middleware, one connection handler', () => {
            const onSpy  = jest.spyOn(IoServer.Server.prototype, 'on');
            const useSpy = jest.spyOn(IoServer.Server.prototype, 'use');
            const server = new WebSocketServer();

            server.listen();

            expect(useSpy).toHaveBeenCalledTimes(1);
            expect(onSpy).toHaveBeenCalledTimes(1);
            expect(onSpy).toHaveBeenCalledWith('connection', expect.any(Function));
        });
    });

    describe('WebSocketServer#_initWebSocket', () => {
        it('creates a client WebSocket for the socket, with this server as its host, and continues the handshake', async () => {
            const created = [];
            jest.spyOn(WebSocket.prototype, 'init').mockImplementation(async function () { created.push(this); });
            const db = { marker: true } as never; // an opaque stand-in; the code under test only passes it on
            const server = new WebSocketServer(undefined, undefined, db);
            const ioSocket = ioSocketDouble({ apiToken: 'token' });
            const next = jest.fn();

            await server._initWebSocket(ioSocket, next);

            expect(created).toHaveLength(1);
            expect(created[0]).toBeInstanceOf(WebSocket);
            expect(created[0].id).toBe(ioSocket.id);
            expect(created[0].db).toBe(db);
            expect(next).toHaveBeenCalledTimes(1);
            expect(next).toHaveBeenCalledWith();
        });

        it('fails the handshake with the error when the socket cannot init', async () => {
            const error = new Error('cannot init');
            jest.spyOn(WebSocket.prototype, 'init').mockImplementation(async () => { throw error; });
            const server = new WebSocketServer();
            const next = jest.fn();

            await server._initWebSocket(ioSocketDouble({ apiToken: 'token' }), next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next).toHaveBeenCalledWith(error);
        });
    });

    describe('WebSocketServer#on', () => {
        it('calls `on` on the socket.io server with the handler bound to this server', () => {
            const spy = jest.spyOn(IoServer.Server.prototype, 'on');
            const server = new WebSocketServer();
            const handler = jest.fn(function () { return this; });

            server.on('some.event', handler);

            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.mock.calls[0][0]).toBe('some.event');
            expect(spy.mock.calls[0][1]()).toBe(server);
        });
    });

    describe('WebSocketServer#emit', () => {
        it('emits to the room through the socket.io server', () => {
            const emit = jest.fn();
            const toSpy = jest.spyOn(IoServer.Server.prototype, 'to').mockImplementation(() => ({ emit }) as never);
            const server = new WebSocketServer();
            const data = {};

            server.emit('room-1', 'match.update', data);

            expect(toSpy).toHaveBeenCalledTimes(1);
            expect(toSpy).toHaveBeenCalledWith('room-1');
            expect(emit).toHaveBeenCalledTimes(1);
            expect(emit).toHaveBeenCalledWith('match.update', data);
        });
    });
});
