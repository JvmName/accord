const { endRoundValidations } = require('../../lib/controllers/roundsControllerHelpers');
const { ServerController }    = require('../../lib/server');

class RoundsController extends ServerController {
    setupCallbacks() {
        this.beforeCallback('authenticateRequest');
        this.beforeCallback('authenticateMatch');
    }


    async postStartRound() {
        try {
            await this.currentMatch.startRound();
            const options = {includeRounds: true, includeJudges: true, includeMat: true};
            await this.render({match: this.currentMatch}, options);
        } catch(err) {
            await this.renderErrors({matchId: [err.message]});
        }
    }


    async postEndRound() {
        const validations = endRoundValidations.call(this);
        await this.validateParameters(validations);

        try {
            await this.currentMatch.endRound(this.params);
            const options = {includeRounds: true, includeJudges: true, includeMat: true};
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

        await this.authorize('manage', this.currentMatch);
    }
}


module.exports = {
    RoundsController
}
