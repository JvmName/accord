const { WordGenerator } = require('../../lib/external_api/word_generator');


const words = [];
global.fetch = jest.fn().mockReturnValue({
    json:   () => words,
    status: 200
});
afterEach(() => {
    jest.clearAllMocks();
});


describe('WordGenerator', () => {
    const client = new WordGenerator();
    const count  = Math.ceil(Math.random() * 100);

    describe('WordGenerator#getWords', () => {
        it ('makses a request to the random words api', async () => {
            await client.getWords(count);

            const apiUrl = new URL('https://random-words-api.kushcreates.com/api');
            apiUrl.searchParams.append('language', 'en');
            apiUrl.searchParams.append('type',     'lowercase');
            apiUrl.searchParams.append('words',    count);
            apiUrl.searchParams.append('category', 'animals');

            const expectedOptions = {headers: expect.any(Object), method: "GET"};
            expect(fetch).toHaveBeenCalledWith(apiUrl.toString(), expectedOptions);
        });
    });

});
