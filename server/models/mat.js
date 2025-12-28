const { BaseRecord }    = require('../lib/active_record');
const { WordGenerator } = require('../lib/external_api/word_generator');
const { User }          = require('./user');


const CODE_SIZE = 3;


class Mat extends BaseRecord {
    static async findByCode(code) {
        return await this.findOne({where: {code: code}});
    }


    static async generateCode() {
        const words = await new WordGenerator().getWords(CODE_SIZE);
        return words.join('.');
    }


    async toApiResponse() {
        const response = await super.toApiResponse();
        response.judges = await this.getJudges();
        return response;
    }
}


Mat.initialize();


Mat.belongsTo(User, {
    foreignKey: 'creator_id',
    as: 'creator'
});

Mat.belongsToMany(User, {
    as:      'judges',
    through:  'judges_mats'
});

Mat.belongsToMany(User, {
    as:       'viewers',
    through:  'mats_viewers'
});


module.exports = {
    Mat
};
