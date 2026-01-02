const { logger } = require('../logger');
const { User }   = require('../../models/user');


class WebSocket {
    #currentUser;
    #ioSocket;


    constructor(ioSocket) {
        this.#ioSocket = ioSocket;
    }


    async init() {
        await this.#initCurrentUser();
        if (!this.currentUser) {
            throw new Error("unauthorized");
        }
        
        this.on('disconnect', ()     => { logger.info(`Web socket disconnected (${this.id})`) });
        this.on('room.join',  (room) => { this.#ioSocket.join(room) });
        this.on('room.leave', (room) => { this.#ioSocket.leave(room) });

        this.#ioSocket.adapter.on('join-room',  this.#handleRoomJoined);
        this.#ioSocket.adapter.on('leave-room', this.#handleRoomLeft);
    }


    on(eventName, eventHandler) {
        this.#ioSocket.on(eventName, eventHandler.bind(this));
    }


    /***********************************************************************************************
    * ROOMS
    ***********************************************************************************************/
    #handleRoomJoined(room, id) {
        logger.info(`Web socket joined room ${room} (${id})`);
    }


    #handleRoomLeft(room, id) {
        logger.info(`Web socket left room ${room} (${id})`);
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

}


module.exports = {
    WebSocket
}
