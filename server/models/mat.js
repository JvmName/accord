const { BaseRecord }    = require('../lib/active_record');
const { MatCode }       = require('./matCode');
const { User }          = require('./user');
const { WordGenerator } = require('../lib/external_api/word_generator');


class Mat extends BaseRecord {
    static async findByCode(codeStr) {
        const code = await MatCode.findByCode(codeStr);
        if (!code) return;
        return await code.getMat();
    }


    async toApiResponse(options={}) {
        const response  = await super.toApiResponse();
        response.judges = await this.getJudges();

        if (options.includeCodes) response.codes = await this.getMatCodes();

        return response;
    }
}


Mat.initialize();


Mat.belongsTo(User, {
    foreignKey: 'creator_id',
    as:         'creator'
});

Mat.belongsToMany(User, {
    as:      'judges',
    through: 'judges_mats'
});

Mat.belongsToMany(User, {
    as:      'viewers',
    through: 'mats_viewers'
});


Mat.hasMany(MatCode);
MatCode.belongsTo(Mat);


module.exports = {
    Mat
};
