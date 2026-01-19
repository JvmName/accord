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


    emit(room, eventName, eventData) {
        this.#ioServer.to(room).emit(eventName, eventData);
    }


    on(eventName, eventHandler) {
        this.#ioServer.on(eventName, eventHandler.bind(this));
    }


    get #ioServer() {
        if (!this.#_ioServer){ 
            logger.info(`creating new socket.io server`)
            this.#initializeIoServer();
        }
        return this.#_ioServer;
    }


    #initializeIoServer() {
        this.#_ioServer = IoServer(this.#httpServer, {
            cors: { origin: this.#corsOrigin, credentials: true }
        });

        this.#_ioServer.use(this._initWebSocket.bind(this));
        this.#_ioServer.on("connection_error", (err) => {
            console.log(err.req);      // the request object
            console.log(err.code);     // the error code, for example 1
            console.log(err.message);  // the error message, for example "Session ID unknown"
            console.log(err.context);  // some additional error context
        });
    }


    async _initWebSocket(ioSocket, next) {
        const socket = new WebSocket(ioSocket, this);
        try {
            await socket.init();
            next();
        } catch(err) {
            return next(err);
        }
    }


    numClientsInRoom(room) {
        const clients = this.#ioServer.sockets.adapter.rooms.get(room);
        return clients ? clients.size : 0;
    }
}


module.exports = {
WebSocketServer
};
