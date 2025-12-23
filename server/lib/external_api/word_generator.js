const { HttpClient } = require('../http/client');


class WordGenerator extends HttpClient {

    async getWords(count) {
        const language      = 'en';
        const type          = 'lowercase';
        const words         = count;
        const category      = 'animals';
        const requestParams = { language, type, words, category};
        const result        = await this.get('/api', { requestParams });
        return result.data.map(word => word.word.replace(/\s+/, '_'));
    }


    get urlRoot() {
        return 'https://random-words-api.kushcreates.com';
    }
}


module.exports = {
    WordGenerator
}
