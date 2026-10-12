const { afterEach, describe, expect, it, jest } = require('bun:test');
const { Server }            = require('http');
const   CONSTANTS           = require('../../lib/constants');
const { logger }            = require('../../lib/logger');
const { ApplicationServer,
        OPENAPI_VALIDATION_ENV,
        openApiValidationEnabled } = require('../../src/http/server');
const { WebSocketServer }   = require('../../lib/server/webSocketServer');


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;


afterEach(() => {
    jest.restoreAllMocks();
});


/** `METHOD /path` of every route on the server's Express app. */
function routeKeys(server) {
    return server.expressApp.router.stack
        .filter(layer => layer.route)
        .flatMap(layer => Object.keys(layer.route.methods).map(method => `${method.toUpperCase()} ${layer.route.path}`));
}


describe('ApplicationServer', () => {
    describe('ApplicationServer#mountRoutes', () => {
        it('registers the route table on the underlying express app', () => {
            const server = new ApplicationServer({ dev: false });
            server.mountRoutes();

            const methods = routeKeys(server).map(key => key.split(' ')[0]);
            const count   = method => methods.filter(m => m === method).length;
            expect(count('GET')).toBe(6);
            expect(count('POST')).toBe(11);
            expect(count('PATCH')).toBe(1);
            expect(count('DELETE')).toBe(2);
            expect(count('PUT')).toBe(0);
            // Built in system routes
            expect(routeKeys(server)).toContain('GET /');
            expect(routeKeys(server)).toContain('GET /system/healthCheck');
        });

        it('registers the docs routes only in DEV', () => {
            const prod = new ApplicationServer({ dev: false });
            prod.mountRoutes();
            const dev = new ApplicationServer({ dev: true, openApiValidation: false });
            dev.mountRoutes();

            const docs = ['GET /docs', 'GET /docs.json', 'GET /async-docs.json'];
            for (const route of docs) {
                expect(routeKeys(prod)).not.toContain(route);
                expect(routeKeys(dev)).toContain(route);
            }
        });

        it('mounts the global middleware first, then the validator when enabled, then the routes', () => {
            const server = new ApplicationServer({ dev: false, openApiValidation: true });
            server.mountRoutes();

            const names = server.expressApp.router.stack.map(layer => layer.route ? 'route' : layer.name);
            expect(names.slice(0, 8)).toEqual([
                'corsMiddleware', 'jsonParser', 'urlencodedParser', 'responseTime',
                'serveStatic', 'result', 'serveStatic', 'connectionAbortedMiddleware',
            ]);
            const validator  = names.indexOf('pathParamsMiddleware');
            const firstRoute = names.indexOf('route');
            expect(validator).toBeGreaterThan(7);
            expect(firstRoute).toBeGreaterThan(validator);
        });

        it('installs no validator when it is off', () => {
            const server = new ApplicationServer({ dev: false, openApiValidation: false });
            server.mountRoutes();
            expect(server.expressApp.router.stack.map(layer => layer.name)).not.toContain('pathParamsMiddleware');
        });
    });


    describe('ApplicationServer#listen', () => {
        it('starts the web socket server', async () => {
            jest.spyOn(Server.prototype, 'listen').mockImplementation(() => {});
            const webSocketListenSpy = jest.spyOn(WebSocketServer.prototype, 'listen');
            const server = new ApplicationServer();

            await server.listen();
            expect(webSocketListenSpy).toHaveBeenCalledTimes(1);
        });

        it('starts the http server', async () => {
            const httpListenSpy = jest.spyOn(Server.prototype, 'listen').mockImplementation(() => {});
            const server = new ApplicationServer({ port: 4321 });

            await server.listen();
            expect(httpListenSpy).toHaveBeenCalledTimes(1);
            expect(httpListenSpy.mock.calls[0][0]).toBe(4321);
        });

        it('attaches Socket.IO to the same http server that serves the express app', async () => {
            jest.spyOn(Server.prototype, 'listen').mockImplementation(() => {});
            const server = new ApplicationServer();
            expect(server.httpServer.listeners('upgrade')).toHaveLength(0);

            await server.listen();
            expect(server.httpServer.listeners('upgrade')).toHaveLength(1);

            server.startWebSocketServer();
            expect(server.httpServer.listeners('upgrade')).toHaveLength(1);
        });
    });


    describe('ApplicationServer#close', () => {
        it('closes the http server and drops open connections', () => {
            const closeSpy    = jest.spyOn(Server.prototype, 'close').mockImplementation(() => {});
            const closeAllSpy = jest.spyOn(Server.prototype, 'closeAllConnections').mockImplementation(() => {});
            new ApplicationServer().close();

            expect(closeSpy).toHaveBeenCalledTimes(1);
            expect(closeAllSpy).toHaveBeenCalledTimes(1);
        });
    });


    describe('ApplicationServer#onError', () => {
        const listenError = code => Object.assign(new Error(code), { syscall: 'listen', code });

        it('rethrows errors that are not about listening', () => {
            const error = Object.assign(new Error('boom'), { syscall: 'read' });
            expect(() => new ApplicationServer().onError(error)).toThrow('boom');
        });

        it.each([
            ['EACCES',     'Port requires elevated privileges'],
            ['EADDRINUSE', 'Port is already in use'],
        ])('logs %s and exits with 1', (code, message) => {
            const exitSpy  = jest.spyOn(process, 'exit').mockImplementation(() => {});
            const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});

            new ApplicationServer().onError(listenError(code));
            expect(errorSpy).toHaveBeenCalledWith(message);
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('rethrows any other listen error', () => {
            expect(() => new ApplicationServer().onError(listenError('EOTHER'))).toThrow('EOTHER');
        });
    });


    describe('ApplicationServer#workerToken', () => {
        it('generates a random UUID once when none is given', () => {
            const server = new ApplicationServer();
            expect(server.workerToken).toMatch(UUID_RE);
            expect(server.workerToken).toBe(server.workerToken);
            expect(new ApplicationServer().workerToken).not.toBe(server.workerToken);
        });

        it('uses the token it is given', () => {
            expect(new ApplicationServer({ workerToken: 'shared-secret' }).workerToken).toBe('shared-secret');
        });
    });


    describe('settings', () => {
        const savedEnv = { ...process.env };
        afterEach(() => {
            for (const key of ['PORT', 'WEB_ORIGIN', OPENAPI_VALIDATION_ENV]) {
                if (savedEnv[key] === undefined) delete process.env[key];
                else process.env[key] = savedEnv[key];
            }
        });

        it('takes the port from the options, then PORT, then 3000', () => {
            delete process.env.PORT;
            expect(new ApplicationServer().port).toBe(3000);
            process.env.PORT = '4000';
            expect(new ApplicationServer().port).toBe('4000');
            expect(new ApplicationServer({ port: 5000 }).port).toBe(5000);
        });

        it('allows the local web client, plus WEB_ORIGIN when set', () => {
            delete process.env.WEB_ORIGIN;
            expect(new ApplicationServer().corsOrigin).toEqual(['http://localhost:8080']);
            process.env.WEB_ORIGIN = 'https://web.example';
            expect(new ApplicationServer().corsOrigin).toEqual(['http://localhost:8080', 'https://web.example']);
        });

        it('runs in DEV mode exactly when NODE_ENV is development, unless told otherwise', () => {
            expect(new ApplicationServer().dev).toBe(CONSTANTS.DEV);
            expect(new ApplicationServer({ dev: true }).dev).toBe(true);
        });
    });


    describe('openApiValidationEnabled', () => {
        it('defaults to DEV mode', () => {
            expect(openApiValidationEnabled(undefined, true, {})).toBe(true);
            expect(openApiValidationEnabled(undefined, false, {})).toBe(false);
        });

        it('is switched off or on by the environment variable', () => {
            expect(openApiValidationEnabled(undefined, true,  { [OPENAPI_VALIDATION_ENV]: '0' })).toBe(false);
            expect(openApiValidationEnabled(undefined, false, { [OPENAPI_VALIDATION_ENV]: '1' })).toBe(true);
        });

        it('lets the constructor option win over the environment', () => {
            expect(openApiValidationEnabled(false, true,  { [OPENAPI_VALIDATION_ENV]: '1' })).toBe(false);
            expect(openApiValidationEnabled(true,  false, { [OPENAPI_VALIDATION_ENV]: '0' })).toBe(true);
        });

        it('is never on in production', () => {
            const env = CONSTANTS.ENV;
            CONSTANTS.ENV = 'production';
            try {
                expect(openApiValidationEnabled(true, true, { [OPENAPI_VALIDATION_ENV]: '1' })).toBe(false);
            } finally {
                CONSTANTS.ENV = env;
            }
        });
    });
});
