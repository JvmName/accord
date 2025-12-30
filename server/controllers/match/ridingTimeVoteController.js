const { RidingTimeVote }   = require('../../models/ridingTimeVote');
const { ServerController } = require('../../lib/server');


class RidingTimeVoteController extends ServerController {
    setupCallbacks() {
        this.beforeCallback('authenticateRequest');
        this.beforeCallback('authenticateMatch');
    }


    /***********************************************************************************************
    * ACTIONS
    ***********************************************************************************************/
    async postStartRidingTime() {
    }


    async deleteEndRidingTime() {
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
        if (!await this.authorize('judge', this.currentMatch)) {
            return false;
        }
    }

}


module.exports = {
    RidingTimeVoteController
}
