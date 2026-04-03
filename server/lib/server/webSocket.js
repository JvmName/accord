const { AbstractWebSocket }     = require('./abstractWebSocket');
const { Authorizer }            = require('./authorizer');
const { logger }                = require('../logger');
const { Match }                 = require('../../models/match');
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


    addEventHandlers() {
        this.on('match.join',  this.handleMatchJoined.bind(this));
        this.on('match.leave', this.handleMatchLeft.bind(this));
    }


    async handleMatchJoined(matchId) {
        const match = await Match.find(matchId)
        if (!await this.authorizer.can('view', match)) return;

        this.join(this.roomForMatch(matchId));
    }


    handleMatchLeft(matchId) {
        this.leave(this.roomForMatch(matchId));
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
