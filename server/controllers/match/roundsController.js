const { isResultWindowOpen } = require('../../lib/controllers/roundsControllerHelpers');
const { ServerController }    = require('../../lib/server');
const { logger }              = require('../../lib/logger');

class RoundsController extends ServerController {
    setupCallbacks() {
        this.beforeCallback('authenticateRequest');
        this.beforeCallback('authenticateMatch');
    }


    async postStartRound() {
        try {
            await this.currentMatch.startRound();
            logger.info(`Round started: match=${this.currentMatch.id} by user=${this.currentUser.id}`);
            const options = {includeRounds: true, includeJudges: true, includeMat: true};
            await this.render({match: this.currentMatch}, options);
        } catch(err) {
            await this.renderErrors({matchId: [err.message]});
        }
    }


    async postEndRound() {
        try {
            await this.currentMatch.endRound({ safe: false });
            logger.info(`Round ended: match=${this.currentMatch.id} by user=${this.currentUser.id}`);
            const options = {includeRounds: true, includeJudges: true, includeMat: true};
            await this.render({match: this.currentMatch}, options);
        } catch(err) {
            await this.renderErrors({matchId: [err.message]});
        }
    }


    async patchRoundResult() {
        const validations = { winner: { isEnum: { enums: [undefined, 'red', 'blue'] } } };
        await this.validateParameters(validations);

        if (!isResultWindowOpen(this.currentMatch)) {
            await this.renderErrors({matchId: ['Round result can only be set during the break or at match end']}, 422);
            return;
        }

        const lastRound = await this.currentMatch.getLastRound();
        if (!lastRound || !lastRound.ended) {
            await this.renderErrors({matchId: ['No ended round to update']}, 422);
            return;
        }

        try {
            await lastRound.setResult({ winner: this.params.winner, stoppage: this.params.stoppage });
            const winLog = this.params.winner ? ` winner=${this.params.winner} stoppage=${this.params.stoppage}` : '';
            logger.info(`Round result set: match=${this.currentMatch.id} round=${lastRound.id} by user=${this.currentUser.id}${winLog}`);

            const options = {includeRounds: true, includeJudges: true, includeMat: true};
            await this.render({match: this.currentMatch}, options);
        } catch(err) {
            await this.renderErrors({matchId: [err.message]});
        }
    }


    async postPauseRound() {
        await this.authorize('pause', this.currentMatch);

        const round = await this.currentMatch.getLastRound();
        if (!round || !round.started || round.ended) {
            await this.renderErrors({matchId: ['No active round to pause']}, 422);
            return;
        }

        try {
            await round.pause();
            logger.info(`Round paused: match=${this.currentMatch.id} round=${round.id} by user=${this.currentUser.id}`);
            const options = {includeRounds: true, includeJudges: true, includeMat: true};
            await this.render({match: this.currentMatch}, options);
        } catch(err) {
            await this.renderErrors({matchId: [err.message]});
        }
    }


    async postResumeRound() {
        await this.authorize('pause', this.currentMatch);

        const round = await this.currentMatch.getLastRound();
        if (!round || !round.started || round.ended) {
            await this.renderErrors({matchId: ['No active round to resume']}, 422);
            return;
        }

        try {
            await round.resume();
            logger.info(`Round resumed: match=${this.currentMatch.id} round=${round.id} by user=${this.currentUser.id}`);
            const options = {includeRounds: true, includeJudges: true, includeMat: true};
            await this.render({match: this.currentMatch}, options);
        } catch(err) {
            await this.renderErrors({matchId: [err.message]});
        }
    }


    static get routes() {
        return {
          patchRoundResult: `/match/:matchId/rounds/result`,
          postEndRound:     `/match/:matchId/rounds/end`,
          postPauseRound:   `/match/:matchId/rounds/pause`,
          postResumeRound:  `/match/:matchId/rounds/resume`,
          postStartRound:   `/match/:matchId/rounds`
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
            patchRoundResult: {
                description: 'Record the result of the most recently ended round. Only valid during the break or after the match has ended.',
                tags: ['match/rounds'],
                request: {
                    params: { matchId: { type: 'string', required: true } },
                    body: {
                        winner:   { type: 'string', enum: ['red', 'blue'] },
                        stoppage: { type: 'boolean' }
                    }
                },
                response: { match: { $ref: 'Match' } }
            },
            postEndRound: {
                description: 'End the current round for the specified match.',
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
            postPauseRound: {
                description: 'Pause the current active round for the specified match.',
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
            postResumeRound: {
                description: 'Resume the currently paused round for the specified match.',
                tags: ['match/rounds'],
                request: {
                    params: {
                        matchId: { type: 'string', required: true }
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
