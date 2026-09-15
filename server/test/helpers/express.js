const { jest } = require('bun:test');


/**
 * Minimal Express request/response doubles.
 *
 * Extracted from test/controllers/mat/usersController.test.js (where it was
 * described as "mirrors jest-express shape") so that
 * test/server/applicationServer.test.js can drop the `jest-express` dependency
 * and use the same doubles.
 *
 * Surface used by lib/server/serverController.js:
 *   request  -> headers, params, body, query
 *   response -> statusCode, headers, json(), set(), send(), end()
 */
function makeRequest({ headers = {}, params = {}, body = {}, query = {} } = {}) {
    return { headers, params, body, query };
}


function makeResponse() {
    const res = { statusCode: 200, headers: {} };
    res.json = jest.fn(body => { res._body = body; });
    res.set  = jest.fn();
    res.send = jest.fn();
    res.end  = jest.fn();
    return res;
}


module.exports = {
    makeRequest,
    makeResponse,
};
