const { BaseRecord } = require('../lib/active_record');
const { randomUUID } = require('crypto');


class User extends BaseRecord {

    generateApiToken() {
        this.api_token = randomUUID();
    }


    toApiResponse() {
        return {id: this.id, name: this.name, email: this.email};
    }
}


User.initialize();


User.addHook('beforeValidate', (user) => {
    if (!user.api_token) user.generateApiToken();
})


module.exports = {
    User
};
