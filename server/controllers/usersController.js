const { ServerController } = require('../lib/server');
const { User }             = require('../models/user');


class UsersController extends ServerController {
    setupCallbacks() {
        this.beforeCallback('authenticateRequest', {except: 'postIndex'});
    }


    async postIndex() {
        await this.validateParameters(this.creationValidations);
        const user = await User.create({name: this.params.name, email: this.params.email});
        return { user, api_token: user.api_token }; 
    }


    get creationValidations() {
        return {name: {presence: true}, email: {isEmail: true}};
    }
}


module.exports = {
    UsersController
};
