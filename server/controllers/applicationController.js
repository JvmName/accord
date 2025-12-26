const { ServerController } = require('../lib/server');
const { User }             = require('../models/user');


class ApplicationController extends ServerController {
    #currentUser;


    /***********************************************************************************************
    * AUTHENTICATION
    ***********************************************************************************************/
    async setupRequestState() {
        await this.#initCurrentUser();
    }


    async authenticateRequest() {
        if (!this.currentUser) {
            this.renderUnauthorizedResponse();
            return false;
        }
    }


    get currentUser() {
        return this.#currentUser || null;
    }


    get apiToken() {
        return this.requestHeaders['x-api-token'];
    }


    async #initCurrentUser() {
        if (!this.apiToken) return;

        this.#currentUser = await User.findByApiToken(this.apiToken);
    }


}


module.exports = {
    ApplicationController
}
