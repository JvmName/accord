class Authorizer {
    #user;

    constructor(user) {
        this.#user = user;
    }


    async can(action, scope) {
        switch(action) {
            case 'view':
                return await this.canView(scope);
        }
    }


    async canView(scope) {
        if (scope == 'test')                 return true;
        if (scope.constructor.name == 'Mat') return true;
    }
}


module.exports = {
    Authorizer
}
