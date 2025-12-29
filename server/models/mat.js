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


    async getIncompleteMatches() {
        return await this.getMatches({where: {completed_at: null}});
    }


    async toApiResponse(options={}) {
        const response  = await super.toApiResponse();
        response.judges = await this.getJudges();

        if (options.includeCodes) response.codes = await this.getMatCodes();
        if (options.includeMatches) {
            const matches = await this.getIncompleteMatches();
            matches.sort((m1, m2) => m1.sortKey - m2.sortKey);
            response.current_match    = matches.find(m => m.started);
            response.upcoming_matches = matches.filter(m => !m.started);
        }

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
