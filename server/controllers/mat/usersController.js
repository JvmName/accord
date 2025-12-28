const { Mat }              = require('../../models/mat');
const { MatCode }          = require('../../models/matCode');
const { ServerController } = require('../../lib/server');


class UsersController extends ServerController {

    setupCallbacks() {
        this.beforeCallback('authenticateRequest');
    }


    /***********************************************************************************************
    * ACTIONS
    ***********************************************************************************************/
    async getJoin() {
        if (!await this.validateParameters(this.listValidations)) return;
        return await this.listUsers(this.currentMatCode.role);
    }


    async postJoin() {
        return await this.addUser(this.currentMatCode.role);
    }


    async deleteJoin() {
        return await this.removeUser(this.currentMatCode.role);
    }


    static get routes() {
        return {
            deleteJoin: '/mat/:matCode/join',
            getJoin:    '/mat/:matCode/join',
            postJoin:   '/mat/:matCode/join',
        }
    }


    /***********************************************************************************************
    * HELPERS
    ***********************************************************************************************/
    get listValidations() {
        return {role: {isEnum: MatCode.ROLES}};
    }


    async addUser(role) {
        if (role == MatCode.ROLES.JUDGE) {
            await this.addAsJudge();
        } else {
            await this.addAsViewer();
        }

        if (!this.rendered) return {mat: this.currentMat};
    }


    async listUsers(role) {
        let users;
        if (role == MatCode.ROLES.JUDGE) {
            users = await this.currentMat.getJudges();
        } else {
            users = await this.currentMat.getViewers();
        }

        return { users };
    }


    async removeUser(role) {
        if (role == MatCode.ROLES.JUDGE) {
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
}


module.exports = {
    UsersController
}
