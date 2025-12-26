const { BaseRecord }    = require('../lib/active_record');
const { WordGenerator } = require('../lib/external_api/word_generator');
const { User }          = require('./user');


const CODE_SIZE = 3;


class Mat extends BaseRecord {

    static async generateCode() {
        const words = await new WordGenerator().getWords(CODE_SIZE);
        return words.join('.');
    }


    get apiSafeKeys() {
        const keys = super.apiSafeKeys;
        return keys.filter(key => key != 'creatorId');
    }
}


Mat.initialize();


Mat.belongsTo(User, {
    foreignKey: 'creator_id',
    as: 'creator'
});
Mat.belongsToMany(User, {
    as:       'judges',
    otherKey: 'judge_id',
    through:  'judges_mats'
});


module.exports = {
    Mat
};
