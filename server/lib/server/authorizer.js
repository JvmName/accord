const { MatCode } = require('../../models/matCode');


class Authorizer {
    #matCode;
    #user;

    constructor(user, matCode) {
        this.#user    = user;
        this.#matCode = matCode;
    }


    async can(action, scope) {
        if (!scope) return false;

        const cls = this.classForScope(scope);
        switch(cls.name) {
            case 'String':
                return await this.simpleScopePermission(action, scope);
            case 'Mat':
                return await this.matPermission(action, scope)
            case 'Match':
                return await this.matchPermission(action, scope)
            case 'User':
                return await this.userPermission(action, scope)
        }
    }


    classForScope(scope) {
        return scope.constructor == Function ? scope : scope.constructor;
    }


    async simpleScopePermission(action, scope) {
        if (scope == 'test') return true;
        return false;
    }


    async matPermission(action, scope) {
        switch(action) {
            case 'assign':
            case 'create a match':
                if (!this.#matCode)                   return false;
                if (this.#matCode.mat_id != scope.id) return false;
                return this.#matCode.isAdminCode;
            case 'create':
                return true;
            case 'be assigned judge':
                return true;
            case 'view':
                return true;
        }
    }


    async matchPermission(action, scope) {
        switch(action) {
            case 'judge':
                const judges = await scope.getJudges();
                return judges.some(judge => judge.id == this.#user.id);
            case 'manage':
                return true;
            case 'view':
                return true;
        }
    }


    async userPermission(action, scope) {
        switch(action) {
            case 'assign':
                return true;
        }
    }
}


module.exports = {
    Authorizer
}
