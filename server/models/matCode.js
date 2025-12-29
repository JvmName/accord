const { BaseRecord }    = require('../lib/active_record');
const { WordGenerator } = require('../lib/external_api/word_generator');


const CODE_SIZE = 3;


class MatCode extends BaseRecord {
    static ROLES       = {JUDGE: 'judge', VIEWER: 'viewer'};
    static CODE_REGEXP = /\w+\.\w+\.\w+/


    static async findByCode(code) {
        return await this.findOne({where: {code: code}});
    }


    static async generateCode() {
        const words = await new WordGenerator().getWords(CODE_SIZE);
        return words.join('.');
    }


    get apiSafeKeys() {
        return ['code', 'role'];
    }
}

MatCode.initialize();


module.exports = {
    MatCode
}

