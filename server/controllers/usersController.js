const { ServerController } = require('../lib/server');
const { User }             = require('../models/user');


class UsersController extends ServerController {

    async postIndex() {
        if (!this.validateParameters(this.body, this.creationValidations)) return;
        const user = await User.create({name: this.body.name, email: this.body.email});
        return { user }; 
    }


    get creationValidations() {
        return {name: {presence: true}, email: {isEmail: true}};
    }
}


module.exports = {
    UsersController
};
