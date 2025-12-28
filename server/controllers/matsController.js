const { ServerController } = require('../lib/server');
const { Mat }              = require('../models/mat');


class MatsController extends ServerController {
    setupCallbacks() {
        this.beforeCallback('authenticateRequest');
    }


    async postIndex() {
        if (!await this.validateParameters(this.creationValidations)) return;

        const code = await Mat.generateCode();
        const mat  = await Mat.create({creator_id:  this.currentUser.id,
                                       code,
                                       judge_count: this.params.judge_count,
                                       name:        this.params.name});
        return { mat };
    }


    async getMat() {
        const mat = await Mat.findByCode(this.params.matCode);
        this.authorize("view", mat);
        return { mat };
    }


    get creationValidations() {
        return {name: {presence: true}, judge_count: {isInteger: true}};
    }


    static get routes() {
        return {
            getMat: '/mat/:matCode'
        };
    }
}


module.exports = {
    MatsController
};
