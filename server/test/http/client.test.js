const { HttpClient } = require('../../lib/http/client');
const   TestHelpers  = require('../helpers');
const { logger }     = require('../../lib/logger');


const urlRoot            = `https://${TestHelpers.Faker.Text.randomString(10)}.com`.toLowerCase();
const apiEndpoint        = `/${TestHelpers.Faker.Text.randomString(10)}`
const apiUrl             = `${urlRoot}${apiEndpoint}`;
const requestReturnValue = {
  [TestHelpers.Faker.Text.randomString(10)]: Math.random()
};


class ClientWithUrlRoot extends HttpClient {
    get urlRoot() { return urlRoot; }
}


global.fetch = jest.fn().mockReturnValue({
    json:   () => requestReturnValue,
    status: 200
});
logger.info = jest.fn();


afterEach(() => {
    jest.clearAllMocks();
});


describe('HttpClient#urlRoot', () => {
    it ('prepends the url root when overriden', async () => {
        const client = new ClientWithUrlRoot();
        await client.post(apiEndpoint);
        expect(fetch).toHaveBeenCalledWith(apiUrl, expect.any(Object));
    });
});


/***************************************************************************************************
* POST
***************************************************************************************************/
describe('HttpClient#post', () => {
  const client = new HttpClient();

  it ('returns the result of the API request', async () => {
      const res = await client.post(apiUrl);
      expect(res).toEqual({data: requestReturnValue, status: 200});
  });

  it ('calls fetch with the provided url and default params', async () => {
      const expectedRequestParams = {
          method: 'POST',
          body: "{}",
          headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
          }
      }

      await client.post(apiUrl);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(apiUrl, expectedRequestParams);
  });

  it ('includes the provided body in the request', async () => {
      const body = {[TestHelpers.Faker.Text.randomString(10)]: Math.random()};
      await client.post(apiUrl, { body });
      expect(fetch).toHaveBeenCalledWith(apiUrl, expect.objectContaining({
          body: JSON.stringify(body)
      }));
  });

  it ('includes additional headers', async () => {
      const headers               = {[TestHelpers.Faker.Text.randomString(10)]: Math.random()};
      const expectedRequestParams = {
          method: 'POST',
          body: "{}",
          headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              ...headers
          },
      }

      await client.post(apiUrl, { headers });
      expect(fetch).toHaveBeenCalledWith(apiUrl, expectedRequestParams);
  });

  it ('logs api requests', async () => {
      await client.post(apiUrl);
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(`API CALL: POST ${apiUrl}`);
  });
});


/***************************************************************************************************
* PUT
***************************************************************************************************/
describe('HttpClient#put', () => {
  const client = new HttpClient();

  it ('returns the result of the API request', async () => {
      const res = await client.put(apiUrl);
      expect(res).toEqual({data: requestReturnValue, status: 200});
  });

  it ('calls fetch with the provided url and default params', async () => {
      const expectedRequestParams = {
          method: 'PUT',
          body: "{}",
          headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
          }
      }

      await client.put(apiUrl);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(apiUrl, expectedRequestParams);
  });

  it ('includes the provided body in the request', async () => {
      const body = {[TestHelpers.Faker.Text.randomString(10)]: Math.random()};
      await client.put(apiUrl, { body });
      expect(fetch).toHaveBeenCalledWith(apiUrl, expect.objectContaining({
          body: JSON.stringify(body)
      }));
  });

  it ('includes additional headers', async () => {
      const headers               = {[TestHelpers.Faker.Text.randomString(10)]: Math.random()};
      const expectedRequestParams = {
          method: 'PUT',
          body: "{}",
          headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              ...headers
          },
      }

      await client.put(apiUrl, { headers });
      expect(fetch).toHaveBeenCalledWith(apiUrl, expectedRequestParams);
  });

  it ('logs api requests', async () => {
      await client.put(apiUrl);
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(`API CALL: PUT ${apiUrl}`);
  });
});


/***************************************************************************************************
* GET
***************************************************************************************************/
describe('HttpClient#get', () => {
  const client = new HttpClient();
  it ('returns the result of the API request', async () => {
      const res = await client.get(apiUrl);
      expect(res).toEqual({data: requestReturnValue, status: 200});
  });

  it ('calls fetch with the provided url and default params', async () => {
      const expectedRequestParams = {
          method: 'GET',
          headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
          }
      }

      await client.get(apiUrl);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(apiUrl, expectedRequestParams);
  });

  it ('includes the provided params in the url', async () => {
    const param1Name    = TestHelpers.Faker.Text.randomString(10);
      const param1Value   = TestHelpers.Faker.Text.randomString(10);
      const param2Name    = TestHelpers.Faker.Text.randomString(10);
      const param2Value   = TestHelpers.Faker.Text.randomString(10);
      const requestParams = {[param1Name]: param1Value, [param2Name]: param2Value};
      const expectedUrl   = `${apiUrl}?${param1Name}=${param1Value}&${param2Name}=${param2Value}`;
      await client.get(apiUrl, {requestParams });

      expect(fetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
  });

  it ('includes additional headers', async () => {
      const headers               = {[TestHelpers.Faker.Text.randomString(10)]: Math.random()};
      const expectedRequestParams = {
          method: 'GET',
          headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              ...headers
          },
      }

      await client.get(apiUrl, { headers });
      expect(fetch).toHaveBeenCalledWith(apiUrl, expectedRequestParams);
  });

  it ('logs api requests', async () => {
    await client.get(apiUrl);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(`API CALL: GET ${apiUrl}`);
  });
});


/***************************************************************************************************
* DELETE
***************************************************************************************************/
describe('HttpClient#delete', () => {
  const client = new HttpClient();
  it ('returns the result of the API request', async () => {
      const res = await client.delete(apiUrl);
      expect(res).toEqual({data: requestReturnValue, status: 200});
  });

  it ('calls fetch with the provided url and default params', async () => {
      const expectedRequestParams = {
          method: 'DELETE',
          headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
          }
      }

      await client.delete(apiUrl);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(apiUrl, expectedRequestParams);
  });

  it ('includes the provided params in the url', async () => {
    const param1Name    = TestHelpers.Faker.Text.randomString(10);
      const param1Value   = TestHelpers.Faker.Text.randomString(10);
      const param2Name    = TestHelpers.Faker.Text.randomString(10);
      const param2Value   = TestHelpers.Faker.Text.randomString(10);
      const requestParams = {[param1Name]: param1Value, [param2Name]: param2Value};
      const expectedUrl   = `${apiUrl}?${param1Name}=${param1Value}&${param2Name}=${param2Value}`;
      await client.delete(apiUrl, {requestParams });

      expect(fetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
  });

  it ('includes additional headers', async () => {
      const headers               = {[TestHelpers.Faker.Text.randomString(10)]: Math.random()};
      const expectedRequestParams = {
          method: 'DELETE',
          headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              ...headers
          },
      }

      await client.delete(apiUrl, { headers });
      expect(fetch).toHaveBeenCalledWith(apiUrl, expectedRequestParams);
  });

  it ('logs api requests', async () => {
    await client.delete(apiUrl);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(`API CALL: DELETE ${apiUrl}`);
  });
});
