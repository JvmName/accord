const { ServerController } = require('../lib/server');
const { Mat }              = require('../models/mat');


class MatsController extends ServerController {
    setupCallbacks() {
        this.beforeCallback('authenticateRequest');
    }


    async postIndex() {
        if (!this.validateParameters(this.creationValidations)) return;

        const code = await Mat.generateCode();
        const mat  = await Mat.create({creator_id:  this.currentUser.id,
                                       code,
                                       judge_count: this.params.judge_count,
                                       name:        this.params.name});
        return { mat };
    }


    get creationValidations() {
        return {name: {presence: true}, judge_count: {isInteger: true}};
    }
}


module.exports = {
    MatsController
};
