const { ServerController } = require('../lib/server');
const { User }             = require('../models/user');


class UsersController extends ServerController {
    setupCallbacks() {
        this.beforeCallback('authenticateRequest', {except: 'postIndex'});
    }


    static get openapi() {
        return {
            postIndex: {
                description: "Register a new user and receive an API token",
                tags: ["users"],
                request: {
                    body: {
                        name: { type: "string", required: true }
                    }
                },
                response: {
                    user: { $ref: "User" },
                    api_token: { type: "string" }
                }
            }
        };
    }


    async postIndex() {
        await this.validateParameters(this.creationValidations);
        const user = await User.create({name: this.params.name});
        return { user, api_token: user.api_token }; 
    }


    get creationValidations() {
        return {name: {presence: true}};
    }
}


module.exports = {
    UsersController
};
