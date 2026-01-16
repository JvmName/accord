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

            // Check for tech fall after vote
            const techFallTriggered = await this.#checkTechFall();
            if (techFallTriggered) {
                // Emit WebSocket event for round end
                const WEB_SOCKET_SERVER = require('../../lib/server/webSocketServer');
                const room = `match:${this.currentMatch.id}`;
                WEB_SOCKET_SERVER.emit(room, 'round.ended', {
                    matchId: this.currentMatch.id,
                    roundId: this.#currentRound.id
                });
            }
        } catch(err) {
            await this.renderErrors({matchId: [err.message]});
        }

        const options = {includeRounds: true, includeJudges: true, includeMat: true};
        await this.render({match: this.currentMatch}, options);
    }


    async deleteEndRidingTime() {
        try {
            await this.#currentRound.endRidingTime(this.currentUser, this.params.rider);

            // Check for tech fall after vote
            const techFallTriggered = await this.#checkTechFall();
            if (techFallTriggered) {
                const WEB_SOCKET_SERVER = require('../../lib/server/webSocketServer');
                const room = `match:${this.currentMatch.id}`;
                WEB_SOCKET_SERVER.emit(room, 'round.ended', {
                    matchId: this.currentMatch.id,
                    roundId: this.#currentRound.id
                });
            }
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
    async #checkTechFall() {
        const round = this.#currentRound;
        if (!round || round.ended) return false;

        const match = await this.currentMatch;
        const red = await match.getRedCompetitor();
        const blue = await match.getBlueCompetitor();
        const judges = await match.getJudges();

        const votes = await round.getRidingTimeVotes();
        const redVotes = votes.filter(v => v.competitor_id == red.id);
        const blueVotes = votes.filter(v => v.competitor_id == blue.id);

        const { calculateRidingTime } = require('../../lib/ridingTime');
        const redResult = calculateRidingTime(redVotes, judges, null, red.id);
        const blueResult = calculateRidingTime(blueVotes, judges, null, blue.id);

        const maxPoints = round.max_points;
        if (!maxPoints) return false;  // No tech fall if no maxPoints set

        if (redResult.points >= maxPoints) {
            await match.endRound({ techFallWinner: red.id });
            return true;
        } else if (blueResult.points >= maxPoints) {
            await match.endRound({ techFallWinner: blue.id });
            return true;
        }

        return false;
    }


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
