const { ApplicationController } = require('./applicationController');
const { User }                  = require('../models/user');


class UsersController extends ApplicationController {
    setupCallbacks() {
        this.beforeCallback('authenticateRequest', {except: 'postIndex'});
    }


    async postIndex() {
        if (!this.validateParameters(this.creationValidations)) return;
        const user = await User.create({name: this.params.name, email: this.params.email});
        return { user }; 
    }


    get creationValidations() {
        return {name: {presence: true}, email: {isEmail: true}};
    }
}


module.exports = {
    UsersController
};
