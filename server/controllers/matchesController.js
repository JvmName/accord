const { Mat }              = require('../models/mat');
const { Match }            = require('../models/match');
const { ServerController } = require('../lib/server');
const { User }             = require('../models/user');


class MatchesController extends ServerController {
    setupCallbacks() {
        this.beforeCallback('authenticateRequest');
    }


    /***********************************************************************************************
    * ACTIONS
    ***********************************************************************************************/
    async postIndex() {
        await this.authorize('create', Match);

        const { red, blue, errors } = await this.getMatCreationVariables();
        if (Object.keys(errors).length) return this.renderErrors(errors);

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


    async getMat() {
        const matId = this.params.matId;
        if (matId) return await Mat.find(matId);

        const matCode = this.params.matCode;
        if (matCode) return await Mat.findByCode(matCode);
    }


    async getUser(paramName) {
        const userId = this.params[paramName];
        if (userId) return await User.find(userId);
    }
}


module.exports = {
    MatchesController
}
