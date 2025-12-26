const { BaseRecord } = require('../lib/active_record');
const { randomUUID } = require('crypto');


class User extends BaseRecord {

    generateApiToken() {
        this.api_token = randomUUID();
    }


    static async findByApiToken(token) {
        return await this.findOne({where: {api_token: token}});
    }


    toApiResponse() {
        return {id: this.id, name: this.name, email: this.email, api_token: this.api_token};
    }
}


User.initialize();


User.addHook('beforeValidate', (user) => {
    if (!user.api_token) user.generateApiToken();
})


module.exports = {
    User
};
