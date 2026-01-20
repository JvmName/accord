const { endRoundValidations } = require('../lib/controllers/roundsControllerHelpers');
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

        const { red, blue } = await this.getCompetitors();

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
        const renderOptions = {includeMat: true, includeMatchJudges: true, includeRounds: true};
        await this.render({match: this.currentMatch}, renderOptions);
    }


    async postEndMatch() {
        await this.authorize('manage', this.currentMatch);

        const validations = endRoundValidations.call(this);
        await this.validateParameters(validations);

        if (!this.currentMatch.started) {
            return await this.renderErrors({matchId: ['this match has not started']});
        }
        if (this.currentMatch.ended) {
            return await this.renderErrors({matchId: ['this match has already ended']});
        }

        await this.currentMatch.end(this.params);
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


    async getCompetitors() {
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
