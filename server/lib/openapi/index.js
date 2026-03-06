// Single entry point for OpenAPI and AsyncAPI documentation generation.
// Used by ApplicationServer at startup.

const specGenerator      = require('./specGenerator');
const asyncApiGenerator  = require('./asyncApiGenerator');
const validator          = require('./validator');

let cachedOpenApiSpec  = null;
let cachedAsyncApiSpec = null;


/**
 * Run validation and generate both specs. Results are cached for subsequent
 * calls to getOpenApiSpec() and getAsyncApiSpec().
 *
 * @param {Function[]} controllerClasses - Array of ServerController subclasses.
 */
function generateDocs(controllerClasses) {
    validator.validate(controllerClasses);
    cachedOpenApiSpec  = specGenerator.generate(controllerClasses);
    cachedAsyncApiSpec = asyncApiGenerator.generate();
}


/**
 * Returns the cached OpenAPI 3.1 spec object, or null if generateDocs has not
 * yet been called.
 */
function getOpenApiSpec() {
    return cachedOpenApiSpec;
}


/**
 * Returns the cached AsyncAPI 2.6 spec object, or null if generateDocs has not
 * yet been called.
 */
function getAsyncApiSpec() {
    return cachedAsyncApiSpec;
}


module.exports = { generateDocs, getOpenApiSpec, getAsyncApiSpec };
