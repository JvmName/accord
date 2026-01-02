const { HttpError } = require('../../lib/http/error');
const   TestHelpers = require('../helpers');

const key1 = TestHelpers.Faker.Text.randomString(10)
const key2 = TestHelpers.Faker.Text.randomString(10)
const key3 = TestHelpers.Faker.Text.randomString(10)
const key4 = TestHelpers.Faker.Text.randomString(10)
const key5 = TestHelpers.Faker.Text.randomString(10)
const val1 = TestHelpers.Faker.Text.randomString(10)
const val2 = TestHelpers.Faker.Text.randomString(10)
const val3 = TestHelpers.Faker.Text.randomString(10)
const val4 = TestHelpers.Faker.Text.randomString(10)
const val5 = TestHelpers.Faker.Text.randomString(10)

const response = {
    headers:    {
        [key1]: val1,
        [key2]: val2,
    },
    status:     Math.random(),
    statusText: TestHelpers.Faker.Text.randomString(10),
    url:        TestHelpers.Faker.Text.randomString(10),
};
const requestPayload = {
  [key3]: val3,
  [key4]: {[key5]: val5}
};
const error = new HttpError(response, requestPayload);


describe('HttpError', () => {
    it ('returns the status code in the message', () => {
        expect(error.message).toEqual(`HTTP Error: ${response.status}`);
    });

    it ('returns the response status code as the status', () => {
        expect(error.status).toEqual(response.status);
    });

    it ('passes through the status text', () => {
        expect(error.statusText).toEqual(response.statusText);
    });

    it ('passes through the url', () => {
        expect(error.url).toEqual(response.url);
    });

    it ('passes through a copy of the response headers', () => {
        expect(error.responseHeaders).toEqual(response.headers);
        expect(error.responseHeaders).not.toBe(response.headers);
    });

    it ('passes through a copy of the request payload', () => {
        expect(error.requestPayload).toEqual(requestPayload);
        expect(error.requestPayload).not.toBe(requestPayload);
    });

    it ('converts the response body to JSON if possible', async () => {
        response.text  = () => `{"${key1}": "${val1}", "${key2}": {"${key3}": "${val3}"}}`;
        const data     = await error.data();
        const expected = {[key1]: val1, [key2]: {[key3]: val3}};
        expect(data).toEqual(expected);
    });

    it ('returns text when the body is not JSON', async () => {
        const text = TestHelpers.Faker.Text.randomString(10);
        response.text  = () => text;
        const data = await error.data();
        expect(data).toEqual(text);
    });
});
