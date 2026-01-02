const { addMatchEventHandlers } = require('./webSocketEventHandlers/matchEventHandlers');
const { Authorizer }            = require('./authorizer');
const { logger }                = require('../logger');
const { User }                  = require('../../models/user');


class WebSocket {
    #authorizer;
    #currentUser;
    #ioSocket;
    #server;


    constructor(ioSocket, server) {
        this.#ioSocket = ioSocket;
        this.#server   = server;
    }


    async init() {
        this.resetSocket();

        await this.#initCurrentUser();
        if (!this.currentUser) {
            this.#ioSocket.close();
            return;
        }

        this.on('disconnect', ()     => { logger.info(`Web socket disconnected (${this.id})`) });
        this.on('room.join',  (room) => { this.join(room)  });
        this.on('room.leave', (room) => { this.leave(room) });

        this.#ioSocket.adapter.on('join-room',  this.#handleRoomJoined.bind(this));
        this.#ioSocket.adapter.on('leave-room', this.#handleRoomLeft.bind(this));

        addMatchEventHandlers(this, this.#server);
    }


    resetSocket() {
        for (const eventName of this.#ioSocket.eventNames()) {
            this.#ioSocket.removeAllListeners(eventName);
        }
        for (const eventName of this.#ioSocket.adapter.eventNames()) {
            this.#ioSocket.adapter.removeAllListeners(eventName);
        }
    }


    /***********************************************************************************************
    * EVENTS
    ***********************************************************************************************/
    on(eventName, eventHandler) {
        this.#ioSocket.on(eventName, eventHandler.bind(this));
    }


    /***********************************************************************************************
    * ROOMS
    ***********************************************************************************************/
    join(room) {
        this.#ioSocket.join(room);
    }


    leave(room) {
        this.#ioSocket.leave(room);
    }


    #handleRoomJoined(room, id) {
        if (this.id == room) return;

        const numConnections = this.#ioSocket.adapter.rooms.get(room).size;
        logger.info(`Web socket joined room ${room}.${numConnections} - (${id})`);
    }


    #handleRoomLeft(room, id) {
        if (this.id == room) return;
        const numConnections = this.#ioSocket.adapter.rooms.get(room).size;
        logger.info(`Web socket left room ${room}.${numConnections} - (${id})`);
    }


    /***********************************************************************************************
    * AUTHENTICATION
    ***********************************************************************************************/
    async #initCurrentUser() {
        if (!this.apiToken) return;

        this.#currentUser = await User.findByApiToken(this.apiToken);
    }


    get id()          { return this.#ioSocket.id }
    get apiToken()    { return this.#ioSocket.handshake.auth?.apiToken; }
    get currentUser() { return this.#currentUser || null; }


    get authorizer() {
        if (!this.#authorizer) this.#authorizer = new Authorizer(this.currentUser);
        return this.#authorizer;
    }
}


module.exports = {
    WebSocket
}
