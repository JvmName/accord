const { ApplicationController } = require('./applicationController');
const { Mat }                   = require('../models/mat');


class MatsController extends ApplicationController {
    setupCallbacks() {
        this.beforeCallback('authenticateRequest');
    }


    async postIndex() {
        if (!this.validateParameters(this.body, this.creationValidations)) return;

        const code = await Mat.generateCode();
        const mat  = await Mat.create({creator_id: this.currentUser.id,
                                       code,
                                       judge_count: this.body.judge_count,
                                       name: this.body.name});
        return { mat };
    }


    get creationValidations() {
        return {name: {presence: true}, judge_count: {isInteger: true}};
    }
}


module.exports = {
    MatsController
};
