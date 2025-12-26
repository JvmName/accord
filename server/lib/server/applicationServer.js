const   CONSTANTS          = require('../constants');
const   express            = require('express');
const   fs                 = require('fs');
const   httpLogger         = require('pino-http')
const { logger }           = require('../logger');
const { pino }             = require('pino');
const   responseTime       = require('response-time');
const   IoServer           = require("socket.io")
const { Server }           = require('http');
const { SystemController } = require('./systemController');
const { ServerController } = require('./serverController');


class ApplicationServer {
    #controllerClasses;
    #_expressServer;
    #host;
    #_httpServer;
    #_ioServer;
    #port;


    constructor({ port, host }={}) {
        this.#port = port || process.env.PORT || 3000;
        this.#host = host || process.env.HOST || 'localhost';
        this.setupMiddleware();
    }


    async listen() {
        await this.registerControllers();

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

      var bind = typeof this.#port === 'string'
        ? 'Pipe ' + this.#port
        : 'Port ' + this.#port;

      // handle specific listen errors with friendly messages
      switch (error.code) {
        case 'EACCES':
          console.error(bind + ' requires elevated privileges');
          process.exit(1);
          break;
        case 'EADDRINUSE':
          console.error(bind + ' is already in use');
          process.exit(1);
          break;
        default:
          throw error;
      }
    }


    /***********************************************************************************************
    * WEB SOCKETS
    ***********************************************************************************************/
    get #ioServer() {
        if (!this.#_ioServer) {
            this.#_ioServer = IoServer(this.#httpServer, {
                cors: { origin: this.corsOrigins, credentials: true }
            });
        }

        return this.#_ioServer;
    }


    emitWebSocketEvent(channel, eventName, eventData) {
        this.#ioServer.to(channel).emit(eventName, eventData);
    }


    addWebSocketEventHandler(eventName, eventHandler) {
        this.#ioServer.on(eventName, eventHandler);
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
    get corsOrigins() {
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
            const controllerInstance = this.buildController(controllerCls, request, response);
            await controllerInstance.setupRequestState();
            controllerInstance.setupCallbacks();

            const responseBody = await this.performRequest(controllerInstance, action);

            if (!controllerInstance.rendered && responseBody) {
                controllerInstance.render(responseBody);
            }

            response.end();
        }.bind(this);
    }


    async performRequest(controllerInstance, action) {
        try {
            return await this._performRequest(controllerInstance, action);
        } catch(err) {
            this.handleError(err, controllerInstance);
        }
    }


    handleError(err, controllerInstance) {
        if (err.name == 'SequelizeUniqueConstraintError') {
            const errors = {};
            for (const activeRecordError of err.errors) {
                errors[activeRecordError.path] = errors[activeRecordError.path] || [];
                errors[activeRecordError.path].push(activeRecordError.message);
            }
            controllerInstance.renderErrors(errors);
        } else {
            controllerInstance.statusCode = 500;
            controllerInstance.render({error: err.message});
            if (CONSTANTS.DEV) throw err;
        }
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
