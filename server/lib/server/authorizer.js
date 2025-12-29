const { MatCode } = require('../../models/matCode');


class Authorizer {
    #matCode;
    #user;

    constructor(user, matCode) {
        this.#user    = user;
        this.#matCode = matCode;
    }


    async can(action, scope) {
        const cls = scope.constructor == Function ? scope : scope.constructor;
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


    async simpleScopePermission(action, scope) {
        if (scope == 'test') return true;
        return false;
    }


    async matPermission(action, scope) {
        switch(action) {
            case 'assign':
              return true;
            case 'create':
                return true;
            case 'judge':
                return this.#matCode && this.#matCode.role == MatCode.ROLES.JUDGE;
            case 'view':
                return true;
        }
    }


    async matchPermission(action, scope) {
        switch(action) {
            case 'create':
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
