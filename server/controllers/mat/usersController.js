const { logger }           = require('../../lib/logger');
const { Mat }              = require('../../models/mat');
const { MatCode }          = require('../../models/matCode');
const { ServerController } = require('../../lib/server');
const { User }             = require('../../models/user');


class UsersController extends ServerController {

    setupCallbacks() {
        this.beforeCallback('authenticateRequest', {except: 'postJoin'});
    }


    /***********************************************************************************************
    * ACTIONS
    ***********************************************************************************************/
    async getViewers() {
        const viewers = await this.currentMat.getViewers();
        return { viewers };
    }


    async getJudges() {
        const judges = await this.currentMat.getJudges();
        return { judges };
    }


    async postJoin() {
        await this.addUser();
        if (!this.rendered) {
            const mat  = this.currentMat;
            const user = this.currentUser;
            await this.render({ mat, user, api_token: this.currentUser.api_token }, {includeMatJudges: true});
        }
    }


    async deleteJoin() {
        await this.removeUser(this.currentMatCode.role);
        if (!this.rendered) {
            await this.render({ mat: this.currentMat }, {includeMatJudges: true});
        }
    }


    static get routes() {
        return {
            deleteJoin: '/mat/:matCode/join',
            getJudges:  '/mat/:matCode/judges',
            getViewers: '/mat/:matCode/viewers',
            postJoin:   '/mat/:matCode/join',
        }
    }


    static get openapi() {
        return {
            getViewers: {
                description: "Get the list of viewers for a mat",
                tags: ["mat/users"],
                request: {
                    params: {
                        matCode: { type: "string", required: true }
                    }
                },
                response: {
                    viewers: { type: "array", items: { $ref: "User" } }
                }
            },
            getJudges: {
                description: "Get the list of judges for a mat",
                tags: ["mat/users"],
                request: {
                    params: {
                        matCode: { type: "string", required: true }
                    }
                },
                response: {
                    judges: { type: "array", items: { $ref: "User" } }
                }
            },
            postJoin: {
                description: "Join a mat as a viewer or judge using a mat code",
                tags: ["mat/users"],
                request: {
                    params: {
                        matCode: { type: "string", required: true }
                    },
                    body: {
                        name: { type: "string" }
                    }
                },
                response: {
                    mat:       { $ref: "Mat" },
                    user:      { $ref: "User" },
                    api_token: { type: "string" }
                }
            },
            deleteJoin: {
                description: "Leave a mat (remove self as viewer or judge)",
                tags: ["mat/users"],
                request: {
                    params: {
                        matCode: { type: "string", required: true }
                    }
                },
                response: {
                    mat: { $ref: "Mat" }
                }
            }
        };
    }


    /***********************************************************************************************
    * HELPERS
    ***********************************************************************************************/
    async addUser() {
        if (!this.currentMatCode) {
            await this.renderErrors({matCode: ['not found']}, 404);
            return;
        }

        if (!this.currentUser) {
            const name       = this.params.name || 'Anonymous';
            this.currentUser = await User.create({name: name});
        }

        const role = this.currentMatCode.role;
        if (role == MatCode.ROLES.ADMIN) {
            await this.addAsJudge();
        } else {
            await this.addAsViewer();
        }
    }


    async removeUser(role) {
        if (role == MatCode.ROLES.ADMIN) {
            await this.authorize("assign",            this.currentMat);
            await this.authorize("be assigned judge", this.currentMat);
            await this.currentMat.removeJudge(this.currentUser);
            logger.info(`Judge removed: user=${this.currentUser.id} mat=${this.currentMat.id}`);
        } else {
            await this.currentMat.removeViewer(this.currentUser);
            logger.info(`Viewer removed: user=${this.currentUser.id} mat=${this.currentMat.id}`);
        }
    }


    async addAsJudge(user) {
        await this.authorize("assign",            this.currentMat);
        await this.authorize("be assigned judge", this.currentMat);

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
        logger.info(`Judge added: user=${this.currentUser.id} mat=${this.currentMat.id}`);
    }


    async addAsViewer(user) {
        const viewers = await this.currentMat.getViewers({where: {id: this.currentUser.id}});
        if (viewers.length) {
            await this.renderErrors({matCode: ['user is already a viewer']});
            return;
        }
        await this.currentMat.addViewer(this.currentUser);
        logger.info(`Viewer added: user=${this.currentUser.id} mat=${this.currentMat.id}`);
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
    }
}


module.exports = {
    UsersController
}
