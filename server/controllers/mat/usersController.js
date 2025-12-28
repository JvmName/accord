const { Mat }              = require('../../models/mat');
const { ServerController } = require('../../lib/server');
const { User }             = require('../../models/user');


class UsersController extends ServerController {
    #currentMat;

    setupCallbacks() {
        this.beforeCallback('authenticateRequest');
    }


    /***********************************************************************************************
    * ACTIONS
    ***********************************************************************************************/
    async getJudges()     { return await this.listUsers(User.ROLES.JUDGE); }
    async getViewers()    { return await this.listUsers(User.ROLES.VIEWER); }
    async postJudges()    { return await this.addUser(User.ROLES.JUDGE); }
    async postViewers()   { return await this.addUser(User.ROLES.VIEWER); }
    async deleteJudges()  { return await this.removeUser(User.ROLES.JUDGE); }
    async deleteViewers() { return await this.removeUser(User.ROLES.VIEWER); }


    static get routes() {
        return {
            getJudges:     '/mat/:matCode/judges',
            postJudges:    '/mat/:matCode/judges',
            deleteJudges:  '/mat/:matCode/judges',
            getViewers:    '/mat/:matCode/viewers',
            postViewers:   '/mat/:matCode/viewers',
            deleteViewers: '/mat/:matCode/viewers',
        }
    }


    /***********************************************************************************************
    * HELPERS
    ***********************************************************************************************/
    async addUser(role) {
        if (role == User.ROLES.JUDGE) {
            await this.addAsJudge();
        } else {
            await this.addAsViewer();
        }

        if (!this.rendered) return {mat: this.currentMat};
    }


    async listUsers(role) {
        let users;
        if (role == User.ROLES.JUDGE) {
            users = await this.currentMat.getJudges();
        } else {
            users = await this.currentMat.getViewers();
        }

        return { users };
    }


    async removeUser(role) {
        if (role == User.ROLES.JUDGE) {
            await this.currentMat.removeJudge(this.currentUser);
        } else {
            await this.currentMat.removeViewer(this.currentUser);
        }
    }


    async addAsJudge() {
        await this.authorize("judge", this.currentMat);

        const judges = await this.currentMat.getJudges()
        if (judges.some(judge => judge.id == this.currentUser.id)) {
            await this.renderErrors({matCode: ['user is already a judge']});
            return;
        }

        if (judges.length >= this.currentMat.judge_count) {
            await this.renderErrors({matCode: ['maximum judge count reached']});
            return;
        }
        await this.currentMat.addJudge(this.currentUser);
    }


    async addAsViewer() {
        const viewers = await this.currentMat.getViewers({where: {id: this.currentUser.id}});
        if (viewers.length) {
            await this.renderErrors({matCode: ['user is already a viewer']});
            return;
        }
        await this.currentMat.addViewer(this.currentUser);
    }


    /***********************************************************************************************
    * AUTHENTICATION
    ***********************************************************************************************/
    async authenticateRequest() {
        const authenticated = super.authenticateRequest();
        if (authenticated === false) return false;

        if (!this.currentMat) {
            await this.renderNotFoundResponse();
            return false;
        }

        await this.authorize('view', this.currentMat);
    }


    async setupRequestState() {
        await super.setupRequestState();
        if (this.matCode) this.#currentMat = await Mat.findByCode(this.matCode);
    }


    get currentMat() { return this.#currentMat || null; }
    get matCode()    { return this.params.matCode; }
}


module.exports = {
    UsersController
}
