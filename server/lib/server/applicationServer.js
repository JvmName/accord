const   CONSTANTS          = require('../constants');
const   express            = require('express');
const   fs                 = require('fs');
const   httpLogger         = require('pino-http')
const { logger }           = require('../logger');
const { pino }             = require('pino');
const   responseTime       = require('response-time');
const { Server }           = require('http');
const { SystemController } = require('./systemController');
const { AuthorizationError,
        ServerController,
        ValidationError }  = require('./serverController');
const { WebSocketServer }  = require('./webSocketServer');


class ApplicationServer {
    #controllerClasses;
    #_expressServer;
    #host;
    #_httpServer;
    #port;


    constructor({ port, host }={}) {
        this.#port = port || process.env.PORT || 3000;
        this.#host = host || process.env.HOST || 'localhost';
        this.setupMiddleware();
    }


    async listen() {
        await this.registerControllers();
        this.startWebSocketServer();

        this.#httpServer.on('error', this.onError.bind(this));
        this.#httpServer.listen(this.#port, this.#host, () => {
            this.logger.info(`Server is running on port ${this.#port}`);
        });
    }


    get host()   { return this.#host; }
    get port()   { return this.#port; }
    get logger() { return logger; }


    onError(error) {
      if (error.syscall !== 'listen') {
          throw error;
      }

      // handle specific listen errors with friendly messages
      switch (error.code) {
          case 'EACCES':
              logger.error('Port requires elevated privileges');
              process.exit(1);
              break;
          case 'EADDRINUSE':
              logger.error('Port is already in use');
              process.exit(1);
              break;
          default:
              throw error;
        }
    }


    /***********************************************************************************************
    * WEB SOCKETS
    ***********************************************************************************************/
    startWebSocketServer() {
        const server = new WebSocketServer(this.#httpServer, this.corsOrigin);
        server.listen();
    }


    /***********************************************************************************************
    * MIDDLEWARE
    ***********************************************************************************************/
    setupMiddleware() {
        this.use(this.jsonParsingMiddleware);
        this.use(express.urlencoded({ extended: true }));
        this.use(responseTime())
        this.use(express.static('public'))
        this.use(this.loggingMiddleware);
        this.use('/static', express.static(this.staticFilesDirectory));
        this.use(this.connectionAbortedMiddleware);
    }


    get jsonParsingMiddleware() {
        return express.json({
            type:           [
              'application/json',
              'text/plain',         // AWS sends this content-type for its messages/notifications
            ]
        })
    }


    get loggingMiddleware() {
        return httpLogger({
            logger: logger,
            customLogLevel: (res, err) => {
                if (res.statusCode >= 500) return 'error';
                if (res.statusCode >= 400) return 'warn';
                return 'info';
            },
            serializers: {
                // Format the request log as a string
                req: (req) => `Request: ${req.method} ${req.url}`,
                // Format the response log as a string
                res: (res) => `statusCode=${res.statusCode}, responseTime=${res.get('X-Response-Time')}`,
            },
            wrapSerializers: false,
        })
    }


    get staticFilesDirectory() {
        return `${process.cwd()}/public`;
    }


    get connectionAbortedMiddleware() {
        return async function (err, req, res, next) {
            if (err && err.code === 'ECONNABORTED') {
                return res.status(400).end(); // Don't process this error any further to avoid its logging
            }
            next();
        };
    }


    use() { this.#expressServer.use(...arguments); }


    /***********************************************************************************************
    * SETTINGS
    ***********************************************************************************************/
    get corsOrigin() {
        return [];
    }
    

    set() { this.#expressServer.set(...arguments); }


    /***********************************************************************************************
    * ACTION SETUP
    * The server searches through all paths defined in `controllerDirectories` for any subclasses
    * of ServerController and registers their actions
    ***********************************************************************************************/
    registerControllers() {
        this.#registerDefaultControllers();
        this.controllerClasses.forEach((controllerCls => {
            this.#registerController(controllerCls);
        }).bind(this));
    }


    #registerDefaultControllers() {
        this.#registerController(SystemController);
    }


    #registerController(controllerCls) {
        controllerCls.actions.forEach((action => {
            this.#registerAction(action, controllerCls)
        }).bind(this));
    }


    #registerAction(action, controllerCls) {
        const method         = action.method.toLowerCase();
        const requestHandler = this.requestHandler(action.action, controllerCls)
        this['_'+method](action.path, requestHandler);
    }


    _get()    { this.#expressServer.get(...arguments); }
    _post()   { this.#expressServer.post(...arguments); }
    _put()    { this.#expressServer.put(...arguments); }
    _delete() { this.#expressServer.delete(...arguments); }
    _patch()  { this.#expressServer.patch(...arguments); }


    requestHandler(action, controllerCls) {
        return async function(request, response) {
            if (CONSTANTS.ENV != 'test') this.logger.info(`${controllerCls.name}#${action}`);
            const controllerInstance = this.buildController(controllerCls, request, response);
            await controllerInstance.setupRequestState();

            if (controllerInstance.rendered) {
                response.end();
                return;
            }

            controllerInstance.setupCallbacks();

            const responseBody = await this.performRequest(controllerInstance, action);

            if (!controllerInstance.rendered) {
                await controllerInstance.render(responseBody || {});
            }

            response.end();
        }.bind(this);
    }


    async performRequest(controllerInstance, action) {
        try {
            return await this._performRequest(controllerInstance, action);
        } catch(err) {
            await this.handleError(err, controllerInstance);
        }
    }


    async handleError(err, controllerInstance) {
        if (err.name == 'SequelizeUniqueConstraintError') {
            const errors = {};
            for (const activeRecordError of err.errors) {
                errors[activeRecordError.path] = errors[activeRecordError.path] || [];
                errors[activeRecordError.path].push(activeRecordError.message);
            }
            if (err.parent) errors[null] = err.parent.message;
            await controllerInstance.renderErrors(errors);

        } else if (err.constructor == AuthorizationError) {
            await controllerInstance.renderUnauthorizedResponse();
            return;

        } else if (err.constructor == ValidationError) {
            await controllerInstance.renderErrors(err.errors);
            return;

        } else {
            controllerInstance.statusCode = 500;
            await controllerInstance.render({error: err.message});
        }

        if (CONSTANTS.DEV) console.log(err);
    }


    async _performRequest(controllerInstance, action) {
        if (await controllerInstance.runBeforeCallbacks(action) === false) return false;
        const responseBody = await controllerInstance[action]();
        if (await controllerInstance.runAfterCallbacks(action) === false)  return false;

        return responseBody;
    }


    buildController(controllerCls, request, response) {
        return new controllerCls(request, response);
    }


    get controllerClasses() {
        if (this.#controllerClasses) return this.#controllerClasses;
        this.#controllerClasses = [];

        this.controllerDirectories.forEach(dir => {
          this.#importControllers(dir, dir);
        });

        return this.#controllerClasses;
    }


    #importControllers(dir, topLevelDirectory) {
        fs.readdirSync(dir).forEach((f => {
            const filePath = `${dir}/${f}`;
            if (fs.lstatSync(filePath).isDirectory()) {
                this.#importControllers(filePath, topLevelDirectory);
            } else if (f.endsWith('.js')) {
                this.#importControllersFromFile(filePath, dir, topLevelDirectory);
            }
        }).bind(this));
    }

    
    #importControllersFromFile(filePath, dir, topLevelDirectory) {
        const exports     = Object.values(require(filePath));
        exports.forEach(_export => {
            if (_export.prototype instanceof ServerController) {
                const directoryPrefix   = dir.replace(topLevelDirectory, '');
                _export.directoryPrefix = directoryPrefix;
                this.#controllerClasses.push(_export);
            }
        });
    }


    get controllerDirectories() {
        return [`${process.cwd()}/controllers`];
    }


    get #expressServer() {
        if (!this.#_expressServer) this.#_expressServer = express();
        return this.#_expressServer;
    }


    get #httpServer() { // Needed for io socket to work
        if (!this.#_httpServer) this.#_httpServer = Server(this.#expressServer);
        return this.#_httpServer;
    }
}


module.exports = {
    ApplicationServer
}
