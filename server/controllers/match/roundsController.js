const { ServerController } = require('../../lib/server');


class RoundsController extends ServerController {
    setupCallbacks() {
        this.beforeCallback('authenticateRequest');
        this.beforeCallback('authenticateMatch');
    }


    async postStartRound() {
        try {
            await this.currentMatch.startRound();
            const options = {includeRounds: true, includeMat: true};
            await this.render({match: this.currentMatch}, options);
        } catch(err) {
            await this.renderErrors({matchId: [err.message]});
        }
    }


    async postEndRound() {
        try {
            await this.currentMatch.endRound();
            const options = {includeRounds: true, includeMat: true};
            await this.render({match: this.currentMatch}, options);
        } catch(err) {
            await this.renderErrors({matchId: [err.message]});
        }
    }


    static get routes() {
        return {
          postEndRound:   `/match/:matchId/rounds/end`,
          postStartRound: `/match/:matchId/rounds`
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
        if (await this.authorize('manage', this.currentMatch) === false) {
            return false;
        }
    }
}


module.exports = {
    RoundsController
}
