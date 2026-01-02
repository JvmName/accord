const { logger }    = require('../logger');
const IoServer      = require("socket.io")
const { WebSocket } = require('./webSocket');


class WebSocketServer {
    #corsOrigin;
    #httpServer;
    #_ioServer;

    constructor(httpServer, corsOrigin) {
        this.#httpServer = httpServer;
        this.#corsOrigin = corsOrigin;
    }


    listen() {
        this.on('connection', this.#handleWebSocketConnection);
    }


    #handleWebSocketConnection(ioSocket) {
        logger.info(`Web socket connected (${ioSocket.id})`);
    }


    emit(channel, eventName, eventData) {
        this.#ioServer.to(channel).emit(eventName, eventData);
    }


    on(eventName, eventHandler) {
        this.#ioServer.on(eventName, eventHandler.bind(this));
    }


    get #ioServer() {
        if (!this.#_ioServer) this.#initializeIoServer();
        return this.#_ioServer;
    }


    #initializeIoServer() {
        this.#_ioServer = IoServer(this.#httpServer, {
            cors: { origin: this.#corsOrigin, credentials: true }
        });

        this.#_ioServer.use(this._initWebSocket);
    }


    async _initWebSocket(ioSocket, next) {
        const socket = new WebSocket(ioSocket);
        try {
            await socket.init();
            next();
        } catch(err) {
            return next(err);
        }
    }
}


module.exports = {
    WebSocketServer
};
