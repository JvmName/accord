const   IoServer          = require("socket.io")
const   TestHelpers       = require('../helpers');
const { WebSocket }       = require('../../lib/server/webSocket');
const { WebSocketServer } = require('../../lib/server/webSocketServer');


jest.mock('../../lib/server/webSocket', () => {
    const WebSocket          = jest.fn();
    WebSocket.prototype.init = jest.fn();
    return { WebSocket }
});


afterEach(() => {
    jest.clearAllMocks();
    WebSocket.prototype.init.mockReset();
});


describe('WebSocketServer', () => {
    describe('WebSocketServer#listen', () => {
        const socketOnSpy   = jest.spyOn(IoServer.Server.prototype, 'on');
        const socketUseSpy  = jest.spyOn(IoServer.Server.prototype, 'use');

        it ('starts the ioServer', async () => {
            const server = new WebSocketServer();
            server.listen();

            expect(socketUseSpy).toHaveBeenCalledTimes(1);
            expect(socketUseSpy).toHaveBeenCalledWith(server._initWebSocket);

            expect(socketOnSpy).toHaveBeenCalledTimes(1);
            expect(socketOnSpy).toHaveBeenCalledWith('connection', expect.any(Function));
        });
    });


    describe('WebSocketServer#_initWebSocket', () => {
        it ('creates a new WebSocket', async () => {
            const server   = new WebSocketServer();
            const ioSocket = {};
            const next     = jest.fn();

            await server._initWebSocket(ioSocket, next);

            expect(WebSocket).toHaveBeenCalledTimes(1);
            expect(WebSocket).toHaveBeenCalledWith(ioSocket);
            expect(WebSocket.prototype.init).toHaveBeenCalledTimes(1);
            expect(next).toHaveBeenCalledTimes(1);
            expect(next).toHaveBeenCalledWith();
        });

        it ('errors when the socket cannot init', async () => {
            const server   = new WebSocketServer();
            const next     = jest.fn();
            const error    = new Error();
            WebSocket.prototype.init.mockImplementation(() => { throw error });

            await server._initWebSocket({}, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next).toHaveBeenCalledWith(error);
        });
    });


    describe('ApplicationServer#addWebSocketEventHandler', () => {
        it ('calls on on the underlying socket server', () => {
            const spy       = jest.spyOn(IoServer.Server.prototype, 'on');
            const server    = new WebSocketServer();
            const eventName = TestHelpers.Faker.Text.randomString(10);
            const handler   = jest.fn();
            const bind      = jest.fn(() => handler);

            server.on(eventName, {bind });

            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenCalledWith(eventName, handler);
            expect(bind).toHaveBeenCalledTimes(1);
            expect(bind).toHaveBeenCalledWith(server);
        });
    });


    describe('WebSocketServer#emit', () => {
        it ('calls to on the underlying socket server', () => {
            const toSpy       = jest.spyOn(IoServer.Server.prototype, 'to');
            const emitSpy     = jest.fn();
            const eventName   = TestHelpers.Faker.Text.randomString(10);
            const channelName = TestHelpers.Faker.Text.randomString(10);
            const eventData   = {};
            const server      = new WebSocketServer();
            toSpy.mockImplementation(() => ({emit: emitSpy}));

            server.emit(channelName, eventName, eventData);

            expect(toSpy).toHaveBeenCalledTimes(1);
            expect(toSpy).toHaveBeenCalledWith(channelName);
            expect(emitSpy).toHaveBeenCalledTimes(1);
            expect(emitSpy).toHaveBeenCalledWith(eventName, eventData);
        });
    });
});
