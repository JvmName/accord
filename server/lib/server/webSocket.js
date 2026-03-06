const { AbstractWebSocket }     = require('./abstractWebSocket');
const { addMatchEventHandlers } = require('./webSocketEventHandlers/matchEventHandlers');
const { Authorizer }            = require('./authorizer');
const { logger }                = require('../logger');
const { User }                  = require('../../models/user');


class WebSocket extends AbstractWebSocket {
    #authorizer;
    #currentUser;


    async init() {
        await super.init();

        await this.#initCurrentUser();
        if (!this.currentUser) {
            this.close();
            return;
        }
    }


    async #initCurrentUser() {
        if (!this.apiToken) return;

        this.#currentUser = await User.findByApiToken(this.apiToken);
    }


    get currentUser() { return this.#currentUser || null; }


    get authorizer() {
        if (!this.#authorizer) this.#authorizer = new Authorizer(this.currentUser);
        return this.#authorizer;
    }
}


module.exports = {
    WebSocket
}
