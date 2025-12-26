const { ServerController } = require('../lib/server');
const { Mat }              = require('../models/mat');


class MatsController extends ServerController {
    setupCallbacks() {
        this.beforeCallback('authenticateRequest');
    }


    async postIndex() {
        if (!this.validateParameters(this.body, this.creationValidations)) return;

        const code = await Mat.generateCode();
        const mat  = await Mat.create({name: this.body.name, judge_count: this.body.judge_count, code });
        return { mat };
    }


    get creationValidations() {
        return {name: {presence: true}, judge_count: {isInteger: true}};
    }
}


module.exports = {
    MatsController
};
