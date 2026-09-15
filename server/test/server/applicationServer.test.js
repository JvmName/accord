const { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest, mock, spyOn, test } = require('bun:test');
const { BarController }     = require('./helpers/controllers/barController');
const { BazController }     = require('./helpers/controllers/sub/bazController');
const { FooController }     = require('./helpers/controllers/fooController');
const   IoServer            = require("socket.io")
const { makeRequest,
        makeResponse }      = require('../helpers/express');
const { Server }            = require('http');
const   TestHelpers         = require('../helpers');
const { TestServer }        = require('./helpers/server');
const { ApplicationServer } = require('../../lib/server');
const { WebSocketServer }   = require('../../lib/server/webSocketServer');


// The `jest-express` dependency has been dropped. It was only used to supply a
// fake `express` module plus Request/Response doubles; the real express module
// works fine here (nothing hits the network — `Server.prototype.listen` is
// stubbed below), and the request/response doubles now come from
// test/helpers/express.js, shared with test/controllers/mat/usersController.test.js.


afterEach(() => {
    jest.clearAllMocks();
});


describe('ApplicationServer', () => {
    describe('ApplicationServer#controllers', () => {
        // NOTE: `ApplicationServer#controllerClasses` yields controllers in
        // `fs.readdirSync` order. Node's readdirSync is alphabetically sorted
        // (libuv scandir + alphasort); bun's is raw directory order. These two
        // assertions used to depend on Node's incidental sorting, so they are
        // sorted by class name here before asserting. See FINDINGS.md F-04.
        const byName = (server) => [...server.controllerClasses].sort((a, b) => a.name.localeCompare(b.name));

        it ('searches directories and subdirectories', () => {
            const server      = new TestServer();
            const controllers = byName(server);
            expect(controllers.length).toEqual(3);
            expect(controllers[0]).toBe(BarController);
            expect(controllers[1]).toBe(BazController);
            expect(controllers[2]).toBe(FooController);
        });

        it ('initializes controllers with the correct path', () => {
            const server      = new TestServer();
            const controllers = byName(server);
            expect(controllers[0].routePrefix).toEqual('/bar');
            expect(controllers[1].routePrefix).toEqual('/sub/baz');
            expect(controllers[2].routePrefix).toEqual('/foo');
        });
    });


    describe('ApplicationServer#registerControllers', () => {
        it ('it configures routes on underlying express server', () => {
            const server = new TestServer();
            const getSpy    = jest.spyOn(server, '_get').mockImplementation(() => null);
            const postSpy   = jest.spyOn(server, '_post').mockImplementation(() => null);
            const deleteSpy = jest.spyOn(server, '_delete').mockImplementation(() => null);
            const putSpy    = jest.spyOn(server, '_put').mockImplementation(() => null);
            const patchSpy  = jest.spyOn(server, '_patch').mockImplementation(() => null);
            server.registerControllers();

            expect(getSpy).toHaveBeenCalledTimes(4);
            expect(getSpy).toHaveBeenCalledWith('/foo/fooBar',         expect.any(Function));
            expect(getSpy).toHaveBeenCalledWith('/baz/:id/ban',        expect.any(Function));
            // Built in system routes
            expect(getSpy).toHaveBeenCalledWith('/',                   expect.any(Function));
            expect(getSpy).toHaveBeenCalledWith('/system/healthCheck', expect.any(Function));

            expect(postSpy).toHaveBeenCalledTimes(2);
            expect(postSpy).toHaveBeenCalledWith('/foo',        expect.any(Function));
            expect(postSpy).toHaveBeenCalledWith('/foo/fooBar', expect.any(Function));

            expect(putSpy).toHaveBeenCalledTimes(1);
            expect(putSpy).toHaveBeenCalledWith('/foo/fooBar', expect.any(Function));

            expect(deleteSpy).toHaveBeenCalledTimes(1);
            expect(deleteSpy).toHaveBeenCalledWith('/foo/fooBar', expect.any(Function));

            expect(patchSpy).toHaveBeenCalledTimes(1);
            expect(patchSpy).toHaveBeenCalledWith('/foo/fooBar', expect.any(Function));
        });
    });


    describe('ApplicationServer#requestHandler', () => {
        const server         = new TestServer();
        const request        = makeRequest();
        const response       = makeResponse();

        const beforeSpy1 = jest.spyOn(FooController.prototype, 'beforeCallback1');
        const beforeSpy2 = jest.spyOn(FooController.prototype, 'beforeCallback2');
        const beforeSpy3 = jest.spyOn(FooController.prototype, 'beforeCallback3');
        const beforeSpy4 = jest.spyOn(FooController.prototype, 'beforeCallback4');
        const beforeSpy5 = jest.spyOn(FooController.prototype, 'beforeCallback5');

        const afterSpy1  = jest.spyOn(FooController.prototype, 'afterCallback1');
        const afterSpy2  = jest.spyOn(FooController.prototype, 'afterCallback2');
        const afterSpy3  = jest.spyOn(FooController.prototype, 'afterCallback3');
        const afterSpy4  = jest.spyOn(FooController.prototype, 'afterCallback4');
        const afterSpy5  = jest.spyOn(FooController.prototype, 'afterCallback5');

        it ('calls callbacks in the right order', async () => {
            const postIndexSpy   = jest.spyOn(FooController.prototype, 'postIndex');
            const requestHandler = server.requestHandler('postIndex', FooController);
            await requestHandler(request, response);

            expect(beforeSpy1).toHaveBeenCalledTimes(1);
            expect(beforeSpy1).toHaveBeenCalledBefore(beforeSpy2);
            expect(beforeSpy2).toHaveBeenCalledTimes(1);
            expect(beforeSpy2).toHaveBeenCalledBefore(beforeSpy3);
            expect(beforeSpy3).toHaveBeenCalledTimes(1);
            expect(beforeSpy3).toHaveBeenCalledBefore(beforeSpy5);
            expect(beforeSpy5).toHaveBeenCalledTimes(1);
            expect(beforeSpy5).toHaveBeenCalledBefore(postIndexSpy);

            expect(postIndexSpy).toHaveBeenCalledTimes(1);
            expect(postIndexSpy).toHaveBeenCalledBefore(afterSpy1);

            expect(afterSpy1).toHaveBeenCalledTimes(1);
            expect(afterSpy1).toHaveBeenCalledBefore(afterSpy2);
            expect(afterSpy2).toHaveBeenCalledTimes(1);
            expect(afterSpy2).toHaveBeenCalledBefore(afterSpy3);
            expect(afterSpy3).toHaveBeenCalledTimes(1);
            expect(afterSpy3).toHaveBeenCalledBefore(afterSpy5);
            expect(afterSpy5).toHaveBeenCalledTimes(1);
        });

        it ('calls does not call callbacks that should only be called for some actions', async () => {
            const postFooBarSpy  = jest.spyOn(FooController.prototype, 'postFooBar');
            const requestHandler = server.requestHandler('postFooBar', FooController);
            await requestHandler(request, response);

            expect(beforeSpy1).toHaveBeenCalledTimes(0);
            expect(beforeSpy2).toHaveBeenCalledTimes(1);
            expect(beforeSpy3).toHaveBeenCalledTimes(1);
            expect(beforeSpy5).toHaveBeenCalledTimes(1);

            expect(postFooBarSpy).toHaveBeenCalledTimes(1);

            expect(afterSpy1).toHaveBeenCalledTimes(1);
            expect(afterSpy2).toHaveBeenCalledTimes(1);
            expect(afterSpy3).toHaveBeenCalledTimes(0);
            expect(afterSpy5).toHaveBeenCalledTimes(1);
        });

        it ('calls does not call callbacks that should not be called for some actions', async () => {
            const getFooBarSpy   = jest.spyOn(FooController.prototype, 'getFooBar');
            const requestHandler = server.requestHandler('getFooBar', FooController);
            await requestHandler(request, response);

            expect(beforeSpy1).toHaveBeenCalledTimes(0);
            expect(beforeSpy2).toHaveBeenCalledTimes(1);
            expect(beforeSpy3).toHaveBeenCalledTimes(0);
            expect(beforeSpy5).toHaveBeenCalledTimes(1);

            expect(getFooBarSpy).toHaveBeenCalledTimes(1);

            expect(afterSpy1).toHaveBeenCalledTimes(1);
            expect(afterSpy2).toHaveBeenCalledTimes(0);
            expect(afterSpy3).toHaveBeenCalledTimes(0);
            expect(afterSpy5).toHaveBeenCalledTimes(1);
        });

        it ('does not call the action when a callback return false', async () => {
            const putFooBarSpy   = jest.spyOn(FooController.prototype, 'putFooBar');
            const requestHandler = server.requestHandler('putFooBar', FooController);
            await requestHandler(request, response);

            expect(beforeSpy4).toHaveBeenCalledTimes(1);
            expect(beforeSpy5).toHaveBeenCalledTimes(0);

            expect(putFooBarSpy).toHaveBeenCalledTimes(0);

            expect(afterSpy1).toHaveBeenCalledTimes(0);
            expect(afterSpy2).toHaveBeenCalledTimes(0);
            expect(afterSpy3).toHaveBeenCalledTimes(0);
            expect(afterSpy5).toHaveBeenCalledTimes(0);
        });

        it ('does not call the subsequent callbacks  when a callback return false', async () => {
            const deleteFooBarSpy   = jest.spyOn(FooController.prototype, 'deleteFooBar');
            const requestHandler = server.requestHandler('deleteFooBar', FooController);
            await requestHandler(request, response);

            expect(deleteFooBarSpy).toHaveBeenCalledTimes(1);

            expect(afterSpy1).toHaveBeenCalledTimes(1);
            expect(afterSpy2).toHaveBeenCalledTimes(1);
            expect(afterSpy3).toHaveBeenCalledTimes(0);
            expect(afterSpy4).toHaveBeenCalledTimes(1);
            expect(afterSpy5).toHaveBeenCalledTimes(0);
        });
    });


    describe('ApplicationServer#listen', () => {
        const httpListenSpy = jest.spyOn(Server.prototype, 'listen');
        httpListenSpy.mockImplementation(() => {});

        it ('starts the web socket server', async () => {
            const webSocketListenSpy = jest.spyOn(WebSocketServer.prototype, 'listen');
            const server = new TestServer();

            await server.listen();
            expect(webSocketListenSpy).toHaveBeenCalledTimes(1);
        });

        it ('starts the http server', async () => {
            const server = new TestServer();

            await server.listen();
            expect(httpListenSpy).toHaveBeenCalledTimes(1);
        });
    });
});
