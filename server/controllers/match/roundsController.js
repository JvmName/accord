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


    static get openapi() {
        return {
            postStartRound: {
                description: 'Start a new round for the specified match.',
                tags: ['match/rounds'],
                request: {
                    params: {
                        matchId: { type: 'string', required: true }
                    }
                },
                response: {
                    match: { $ref: 'Match' }
                }
            },
            postEndRound: {
                description: 'End the current round for the specified match, optionally recording a submission and submitter.',
                tags: ['match/rounds'],
                request: {
                    params: {
                        matchId: { type: 'string', required: true }
                    },
                    body: {
                        submission: { type: 'string' },
                        submitter:  { type: 'string', enum: ['red', 'blue'] }
                    }
                },
                response: {
                    match: { $ref: 'Match' }
                }
            }
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
