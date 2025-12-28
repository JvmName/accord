class Authorizer {
    #user;

    constructor(user) {
        this.#user = user;
    }


    async can(action, scope) {
        switch(scope.constructor.name) {
            case 'String':
                return await this.simpleScopePermission(action, scope);
            case 'Mat':
                return await this.matPermission(action, scope)
        }
    }


    async simpleScopePermission(action, scope) {
        if (scope == 'test') return true;
        return false;
    }


    async matPermission(action, scope) {
        switch(action) {
            case 'judge':
                return true;
            case 'view':
                return true;
        }
    }
}


module.exports = {
    Authorizer
}
