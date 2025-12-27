const { logger }     = require('../logger');
const { User }       = require('../../models/user');


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
        
        this.on('disconnect', () => { logger.info(`Web socket disconnected (${this.id})`) });
    }


    on(eventName, eventHandler) {
        this.#ioSocket.on(eventName, eventHandler.bind(this));
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
