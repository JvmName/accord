const { BaseRecord }    = require('../lib/active_record');
const { WordGenerator } = require('../lib/external_api/word_generator');


const CODE_SIZE = 3;


class Mat extends BaseRecord {

    static async generateCode() {
        const words = await new WordGenerator().getWords(CODE_SIZE);
        return words.join('.');
    }


    toApiResponse() {
        return {id: this.id, name: this.name, judge_count: this.judge_count, code: this.code};
    }
}


Mat.initialize();


module.exports = {
    Mat
};
