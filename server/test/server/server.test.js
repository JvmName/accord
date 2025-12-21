const { BarController } = require('./helpers/controllers/barController');
const { BazController } = require('./helpers/controllers/sub/bazController');
const { FooController } = require('./helpers/controllers/fooController');
const { Request }       = require('jest-express/lib/request');
const { Response }      = require('jest-express/lib/response');
const { TestServer }    = require('./helpers/server');
const { ApplicationServer }    = require('../../lib/server');


jest.mock('express', () => {
    const { Response } = require('jest-express/lib/response');

    // missing functions in mock Response
    Response.prototype.on   = jest.fn();

    return require('jest-express');
});


afterEach(() => {
    jest.clearAllMocks();
});


describe('ApplicationServer', () => {
    describe('ApplicationServer#controllers', () => {
        it ('searches directories and subdirectories', () => {
            const server      = new TestServer();
            const controllers = server.controllerClasses;
            expect(controllers.length).toEqual(3);
            expect(controllers[0]).toBe(BarController);
            expect(controllers[1]).toBe(FooController);
            expect(controllers[2]).toBe(BazController);
        });

        it ('initializes controllers with the correct path', () => {
            const server      = new TestServer();
            const controllers = server.controllerClasses;
            expect(controllers[0].routePrefix).toEqual('/bar');
            expect(controllers[1].routePrefix).toEqual('/foo');
            expect(controllers[2].routePrefix).toEqual('/sub/baz');
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
        const request        = new Request();
        const response       = new Response();

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
});
