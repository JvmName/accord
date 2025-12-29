const { ServerController } = require('../lib/server');
const { Mat }              = require('../models/mat');
const { MatCode }          = require('../models/matCode');


class MatsController extends ServerController {
    setupCallbacks() {
        this.beforeCallback('authenticateRequest');
    }


    /***********************************************************************************************
    * ACTIONS
    ***********************************************************************************************/
    async postIndex() {
        await this.authorize("create", Mat);

        if (!await this.validateParameters(this.creationValidations)) return;

        let mat;
        await Mat.transaction(async () => {
            mat = await this.createMat()
        });

        await this.render({ mat }, {includeCodes: true});
    }


    async getMat() {
        await this.authorize("view", this.currentMat);
        await this.render({ mat: this.currentMat }, {includeMatches: true});
    }


    static get routes() {
        return {
            getMat: '/mat/:matId'
        };
    }


    /***********************************************************************************************
    * HELPERS
    ***********************************************************************************************/
    async createMat() {
        const mat = await Mat.create({creator_id:  this.currentUser.id,
                                      judge_count: this.params.judge_count,
                                      name:        this.params.name});
        await this.createMatCode(mat, MatCode.ROLES.JUDGE);
        await this.createMatCode(mat, MatCode.ROLES.VIEWER);

        return mat;
    }


    async createMatCode(mat, role) {
        const code = await MatCode.generateCode();
        return await MatCode.create({ code, role, mat_id: mat.id });
    }


    get creationValidations() {
        return {name: {presence: true},
                judge_count: {isInteger: {gte: 1}}};
    }
}


module.exports = {
    MatsController
};
