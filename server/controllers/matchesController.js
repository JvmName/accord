const { logger }              = require('../lib/logger');
const { Mat }                 = require('../models/mat');
const { Match }               = require('../models/match');
const { ServerController }    = require('../lib/server');
const { User }                = require('../models/user');
const { ValidationError }     = require('../lib/server');


class MatchesController extends ServerController {
    setupCallbacks() {
        this.beforeCallback('authenticateRequest');
        this.beforeCallback('requireMatch', {except: ['postIndex']});
    }


    /***********************************************************************************************
    * ACTIONS
    ***********************************************************************************************/
    async postIndex() {
        await this.authorize('create a match', this.currentMat);
        await this.authorize('assign',         this.currentMat);
        await this.validateCreation();

        const { red, blue } = await this.fetchCompetitors();

        await this.authorize('assign', red);
        await this.authorize('assign', blue);

        const match = await Match.create({
            mat_id:             this.currentMat.id,
            creator_id:         this.currentUser.id,
            red_competitor_id:  red.id,
            blue_competitor_id: blue.id,
        });

        await this.render({ match }, {includeMat: true});
    }


    async postStartMatch() {
        await this.authorize('manage', this.currentMatch);
        if (this.currentMatch.started) {
            return await this.renderErrors({matchId: ['match has already started']});
        }

        await this.currentMatch.start();
        logger.info(`Match started: match=${this.currentMatch.id} by user=${this.currentUser.id}`);
        const renderOptions = {includeMat: true, includeMatchJudges: true, includeRounds: true};
        await this.render({match: this.currentMatch}, renderOptions);
    }


    async postEndMatch() {
        await this.authorize('manage', this.currentMatch);

        if (!this.currentMatch.started) {
            return await this.renderErrors({matchId: ['this match has not started']});
        }
        if (this.currentMatch.ended) {
            return await this.renderErrors({matchId: ['this match has already ended']});
        }

        await this.currentMatch.end();
        logger.info(`Match ended: match=${this.currentMatch.id} by user=${this.currentUser.id}`);
        const renderOptions = {includeMat: true, includeMatchJudges: true, includeRounds: true};
        await this.render({match: this.currentMatch}, renderOptions);
    }


    async getMatch() {
        const renderOptions = {includeMat: true, includeMatchJudges: true, includeRounds: true};
        await this.render({match: this.currentMatch}, renderOptions);
    }


    static get routes() {
        return {
            getMatch:       '/match/:matchId',
            postEndMatch:   '/match/:matchId/end',
            postIndex:      '/mat/:matCode/matches',
            postStartMatch: '/match/:matchId/start'
        };
    }


    static get openapi() {
        return {
            postIndex: {
                description: 'Create a new match on a mat',
                tags: ['matches'],
                request: {
                    params: {
                        matCode: { type: 'string', required: true }
                    },
                    body: {
                        red: { oneOf: [
                            { type: 'object', properties: { id:   { type: 'string', format: 'uuid' } }, required: ['id'],   description: 'Existing user by ID' },
                            { type: 'object', properties: { name: { type: 'string' }                 }, required: ['name'], description: 'New user by name'    },
                        ]},
                        blue: { oneOf: [
                            { type: 'object', properties: { id:   { type: 'string', format: 'uuid' } }, required: ['id'],   description: 'Existing user by ID' },
                            { type: 'object', properties: { name: { type: 'string' }                 }, required: ['name'], description: 'New user by name'    },
                        ]},
                    }
                },
                response: {
                    match: { $ref: 'Match' }
                }
            },
            postStartMatch: {
                description: 'Start a match, assign judges from the mat, and begin the first round',
                tags: ['matches'],
                request: {
                    params: {
                        matchId: { type: 'string', required: true }
                    }
                },
                response: {
                    match: { $ref: 'Match' }
                }
            },
            postEndMatch: {
                description: 'End a match and its current active round',
                tags: ['matches'],
                request: {
                    params: {
                        matchId: { type: 'string', required: true }
                    }
                },
                response: {
                    match: { $ref: 'Match' }
                }
            },
            getMatch: {
                description: 'Get a match by ID',
                tags: ['matches'],
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


    async requireMatch() {
        await super.setupRequestState();
        if (!this.currentMatch) await this.renderNotFoundResponse();
    }


    /***********************************************************************************************
    * HELPERS
    ***********************************************************************************************/
    async validateCreation() {
        const redId    = this.valueForParameterName('red.id');
        const redName  = this.valueForParameterName('red.name');
        const blueId   = this.valueForParameterName('blue.id');
        const blueName = this.valueForParameterName('blue.name');

        const errors = {};
        if (!redId && !redName) {
            errors['red.id']   = ['red.id or red.name required'];
            errors['red.name'] = ['red.id or red.name required'];
        }
        if (!blueId && !blueName) {
            errors['blue.id']   = ['blue.id or blue.name required'];
            errors['blue.name'] = ['blue.id or blue.name required'];
        }

        if (Object.keys(errors).length) throw new ValidationError(errors);
    }


    async fetchCompetitors() {
        let red, blue;
        if (this.params.red.id) {
            red = await User.find(this.params.red.id);
        } else {
            red = await User.create({name: this.params.red.name});
        }

        if (this.params.blue.id) {
            blue = await User.find(this.params.blue.id);
        } else {
            blue = await User.create({name: this.params.blue.name});
        }

        return { red, blue };
    }
}


module.exports = {
    MatchesController
}
