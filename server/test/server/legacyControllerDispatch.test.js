const { afterEach, describe, expect, it, jest } = require('bun:test');
const { FooController }            = require('./helpers/controllers/fooController');
const { makeRequest,
        makeResponse }             = require('../helpers/express');
const { LegacyControllerDispatch } = require('../../lib/server/applicationServer');


// The callback machinery of the old reflection-based controllers. Nothing
// mounts it any more; the old controllers still run through it.


afterEach(() => {
    jest.clearAllMocks();
});


describe('LegacyControllerDispatch#requestHandler', () => {
    const server         = new LegacyControllerDispatch();
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
