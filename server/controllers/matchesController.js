const { endRoundValidations } = require('../lib/controllers/roundsControllerHelpers');
const { Mat }                 = require('../models/mat');
const { Match }               = require('../models/match');
const { ServerController }    = require('../lib/server');
const { User }                = require('../models/user');


class MatchesController extends ServerController {
    setupCallbacks() {
        this.beforeCallback('authenticateRequest');
        this.beforeCallback('requireMatch', {except: ['postIndex']});
    }


    /***********************************************************************************************
    * ACTIONS
    ***********************************************************************************************/
    async postIndex() {
        await this.authorize('create', Match);

        const { red, blue, errors } = await this.getMatCreationVariables();
        if (Object.keys(errors).length) return await this.renderErrors(errors);

        await this.authorize('assign', this.currentMat);
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
        if (!await this.validateParameters(validations)) return;

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
            postIndex:      '/mat/:matId/matches',
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
    async getMatCreationVariables() {
        const errors = {};
        const red    = await this.getUser('red_competitor_id');
        const blue   = await this.getUser('blue_competitor_id');

        if (!this.currentMat) errors.matId              = ['invalid'];
        if (!red)             errors.red_competitor_id  = ['invalid'];
        if (!blue)            errors.blue_competitor_id = ['invalid'];
        if (blue && red && blue.id == red.id) {
            errors.red_competitor_id  = ['red and blue competitors must be different'];
            errors.blue_competitor_id = ['red and blue competitors must be different'];
        }

        return { red, blue, errors };
    }


    async getUser(paramName) {
        const userId = this.params[paramName];
        if (userId) return await User.find(userId);
    }
}


module.exports = {
    MatchesController
}
