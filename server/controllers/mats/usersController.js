const { ApplicationController } = require('../applicationController');
const { Mat }                   = require('../../models/mat');
const { User }                  = require('../../models/user');


class UsersController extends ApplicationController {
    #currentMat;

    setupCallbacks() {
        this.beforeCallback('authenticateRequest');
    }


    /***********************************************************************************************
    * ACTIONS
    ***********************************************************************************************/
    async postIndex() {
        if (!this.validateParameters(this.creationValidations)) return;

        if (this.params.role == User.ROLES.JUDGE) {
            await this.addAsJudge();
        } else {
            await this.addAsViewer();
        }

        if (!this.rendered) return {mat: this.currentMat};
    }


    async getIndex() {
        if (!this.validateParameters(this.listValidations)) return;

        let users;
        if (this.params.role == User.ROLES.JUDGE) {
            users = await this.currentMat.getJudges();
        } else {
            users = await this.currentMat.getViewers();
        }

        return { users };
    }


    async deleteIndex() {
        if (!this.validateParameters(this.deleteValidations)) return;

        if (this.params.role == User.ROLES.JUDGE) {
            await this.currentMat.removeJudge(this.currentUser);
        } else {
            await this.currentMat.removeViewer(this.currentUser);
        }
    }


    /***********************************************************************************************
    * HELPERS
    ***********************************************************************************************/
    async addAsJudge() {
        const judges = await this.currentMat.getJudges()
        if (judges.some(judge => judge.id == this.currentUser.id)) {
            this.renderErrors({matCode: ['user is already a judge']});
            return;
        }

        if (judges.length >= this.currentMat.judge_count) {
            this.renderErrors({matCode: ['maximum judge count reached']});
            return;
        }
        await this.currentMat.addJudge(this.currentUser);
    }


    async addAsViewer() {
        const viewers = await this.currentMat.getViewers({where: {id: this.currentUser.id}});
        if (viewers.length) {
            this.renderErrors({matCode: ['user is already a viewer']});
            return;
        }
        await this.currentMat.addViewer(this.currentUser);
    }


    /***********************************************************************************************
    * VALIDATIONS
    ***********************************************************************************************/
    get creationValidations() {
        return {role: {isEnum: {enums: Object.values(User.ROLES)}}};
    }


    get listValidations() {
        return {role: {isEnum: {enums: Object.values(User.ROLES)}}};
    }


    get deleteValidations() {
        return {role: {isEnum: {enums: Object.values(User.ROLES)}}};
    }


    /***********************************************************************************************
    * AUTHENTICATION
    ***********************************************************************************************/
    authenticateRequest() {
        const authenticated = super.authenticateRequest();
        if (authenticated === false) return false;

      console.log(this.params);
        if (!this.currentMat) {
            this.renderErrors({matCode: ['invalid mat code']});
            return false;
        }
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
