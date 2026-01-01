const { RidingTimeVote }   = require('../../models/ridingTimeVote');
const { ServerController } = require('../../lib/server');


class RidingTimeVoteController extends ServerController {
    #currentRound = null;


    setupCallbacks() {
        this.beforeCallback('authenticateRequest');
        this.beforeCallback('authenticateMatch');
    }


    /***********************************************************************************************
    * ACTIONS
    ***********************************************************************************************/
    async postStartRidingTime() {
        await this.validateParameters(this.validations);
        try {
            await this.#currentRound.startRidingTime(this.currentUser, this.params.rider);
        } catch(err) {
            await this.renderErrors({matchId: [err.message]});
        }


        const options = {includeRounds: true, includeJudges: true, includeMat: true};
        await this.render({match: this.currentMatch}, options);
    }


    async deleteEndRidingTime() {
        try {
            await this.#currentRound.endRidingTime(this.currentUser, this.params.rider);
        } catch(err) {
            await this.renderErrors({matchId: [err.message]});
        }

        const options = {includeRounds: true, includeJudges: true, includeMat: true};
        await this.render({match: this.currentMatch}, options);
    }


    static get routes() {
        return {
            deleteEndRidingTime: '/match/:matchId/ridingTime',
            postStartRidingTime: '/match/:matchId/ridingTime'
        };
    }


    /***********************************************************************************************
    * HELPERS
    ***********************************************************************************************/
    async authenticateMatch() {
        if (!this.currentMatch) {
            await this.renderNotFoundResponse();
            return false;
        }

        if (!this.#currentRound) {
            await this.renderErrors({matchId: ['no active round available']});
            return false;
        }

        await this.authorize('judge', this.currentMatch);
    }


    async setupRequestState() {
        await super.setupRequestState();
        await this.#initCurrentRound();
    }


    async #initCurrentRound() {
        if (!this.currentMatch) return;

        const round = await this.currentMatch.getLastRound();
        if (!round || !round.started || round.ended) return;

        this.#currentRound = round;
    }


    get validations() {
        return {
            rider: {isEnum: {enums: ['red', 'blue']}}
        }
    }
}


module.exports = {
    RidingTimeVoteController
}
