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


    async #initCurrentUser() {
        if (!this.apiToken) return;

        this.#currentUser = await User.findByApiToken(this.apiToken);
    }


    authenticateRequest() {
        if (!this.currentUser) {
            this.renderUnauthorizedResponse();
            return false;
        }
    }


    get currentUser() { return this.#currentUser || null; }
    get apiToken()    { return this.requestHeaders['x-api-token']; }
}


module.exports = {
    ApplicationController
}
