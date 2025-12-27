const { BaseRecord } = require('../lib/active_record');
const { randomUUID } = require('crypto');


class User extends BaseRecord {
    static ROLES = {JUDGE: 'judge', VIEWER: 'viewer'};


    generateApiToken() {
        this.api_token = randomUUID();
    }


    static async findByApiToken(token) {
        return await this.findOne({where: {api_token: token}});
    }
}


User.initialize();


User.addHook('beforeValidate', (user) => {
    if (!user.api_token) user.generateApiToken();
})


module.exports = {
    User
};
