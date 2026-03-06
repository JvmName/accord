const schemas = require('./schemas');


/*************************************************************************************************
 * resolveRefs
 * Recursively walks a plain object/array and rewrites any { $ref: "Name" } shorthand
 * to the full JSON Pointer form { $ref: "#/components/schemas/Name" }.
 *************************************************************************************************/
function resolveRefs(value) {
    if (value === null || typeof value !== 'object') return value;

    if (Array.isArray(value)) {
        return value.map(resolveRefs);
    }

    const result = {};
    for (const [key, val] of Object.entries(value)) {
        if (key === '$ref' && typeof val === 'string' && !val.startsWith('#')) {
            result.$ref = `#/components/schemas/${val}`;
        } else {
            result[key] = resolveRefs(val);
        }
    }
    return result;
}


/*************************************************************************************************
 * buildParameters
 * Converts the `request.params` and `request.query` annotation sub-objects into an OpenAPI
 * parameters array.
 *************************************************************************************************/
function buildParameters(requestAnnotation) {
    const parameters = [];

    if (!requestAnnotation) return parameters;

    const { params, query } = requestAnnotation;

    if (params) {
        for (const [name, schema] of Object.entries(params)) {
            parameters.push({
                name,
                in:       'path',
                required: true,
                schema:   resolveRefs(schema),
            });
        }
    }

    if (query) {
        for (const [name, schema] of Object.entries(query)) {
            parameters.push({
                name,
                in:       'query',
                required: false,
                schema:   resolveRefs(schema),
            });
        }
    }

    return parameters;
}


/*************************************************************************************************
 * buildRequestBody
 * Converts the `request.body` annotation sub-object into an OpenAPI requestBody object.
 *************************************************************************************************/
function buildRequestBody(requestAnnotation) {
    if (!requestAnnotation || !requestAnnotation.body) return undefined;

    return {
        required: true,
        content:  {
            'application/json': {
                schema: resolveRefs(requestAnnotation.body),
            },
        },
    };
}


/*************************************************************************************************
 * buildSuccessResponse
 * Wraps the annotated response shape in the { data, status } envelope that
 * ServerController.formatJSONBody() always produces.
 *************************************************************************************************/
function buildSuccessResponse(responseAnnotation) {
    const dataSchema = responseAnnotation
        ? { type: 'object', properties: resolveRefs(responseAnnotation) }
        : { type: 'object', nullable: true };

    return {
        description: 'Success',
        content:     {
            'application/json': {
                schema: {
                    type:       'object',
                    required:   ['data', 'status'],
                    properties: {
                        data:   dataSchema,
                        status: { type: 'string', enum: ['ok'] },
                    },
                },
            },
        },
    };
}


/*************************************************************************************************
 * standardErrorResponses
 * The $ref entries to add to every operation's `responses` object.
 *************************************************************************************************/
const ERROR_RESPONSE_REFS = {
    '400': { $ref: '#/components/responses/BadRequest'   },
    '401': { $ref: '#/components/responses/Unauthorized' },
    '404': { $ref: '#/components/responses/NotFound'     },
    '500': { $ref: '#/components/responses/ServerError'  },
};


/*************************************************************************************************
 * buildComponentsResponses
 * Defines the reusable error response objects stored under components/responses.
 *************************************************************************************************/
function buildComponentsResponses() {
    const envelope = (dataSchema, statusEnum) => ({
        type:       'object',
        required:   ['data', 'status'],
        properties: {
            data:   dataSchema,
            status: { type: 'string', enum: [statusEnum] },
        },
    });

    return {
        BadRequest: {
            description: 'Bad Request',
            content:     {
                'application/json': {
                    schema: envelope(
                        { type: 'object', properties: { errors: { type: 'object' } } },
                        'bad request'
                    ),
                },
            },
        },
        Unauthorized: {
            description: 'Unauthorized',
            content:     {
                'application/json': {
                    schema: envelope({ type: 'object', nullable: true }, 'unauthorized'),
                },
            },
        },
        NotFound: {
            description: 'Not Found',
            content:     {
                'application/json': {
                    schema: envelope({ type: 'object', nullable: true }, 'not found'),
                },
            },
        },
        ServerError: {
            description: 'Server Error',
            content:     {
                'application/json': {
                    schema: envelope(
                        { type: 'object', properties: { error: { type: 'string' } } },
                        'server error'
                    ),
                },
            },
        },
    };
}


/*************************************************************************************************
 * expressPathToOpenAPI
 * Converts Express-style path params (`:id`) to OpenAPI-style (`{id}`).
 *************************************************************************************************/
function expressPathToOpenAPI(path) {
    return path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}');
}


/*************************************************************************************************
 * generate
 * Main entry point. Accepts an array of controller classes (subclasses of ServerController)
 * and returns a complete, valid OpenAPI 3.1 spec object.
 *************************************************************************************************/
function generate(controllerClasses) {
    const paths = {};

    for (const ControllerClass of controllerClasses) {
        const openapiAnnotations = ControllerClass.openapi || {};
        const actions            = ControllerClass.actions || [];

        for (const action of actions) {
            const { method, action: actionName, path: expressPath } = action;

            const annotation = openapiAnnotations[actionName];
            if (!annotation) continue;  // silently skip unannotated actions

            const openAPIPath = expressPathToOpenAPI(expressPath);
            const httpMethod  = method.toLowerCase();

            if (!paths[openAPIPath]) paths[openAPIPath] = {};

            const parameters   = buildParameters(annotation.request);
            const requestBody  = buildRequestBody(annotation.request);
            const successResp  = buildSuccessResponse(annotation.response);

            const operation = {
                tags:        annotation.tags        || [],
                description: annotation.description || '',
                responses:   {
                    '200': successResp,
                    ...ERROR_RESPONSE_REFS,
                },
            };

            if (parameters.length > 0)  operation.parameters  = parameters;
            if (requestBody)             operation.requestBody = requestBody;

            paths[openAPIPath][httpMethod] = operation;
        }
    }

    // Build the components/schemas object from the pre-defined schema modules.
    // Each schema module exports an object matching the OpenAPI Schema Object format.
    const componentSchemas = {};
    for (const [name, schema] of Object.entries(schemas)) {
        componentSchemas[name] = schema;
    }

    return {
        openapi:  '3.1.0',
        info:     {
            title:   'Accord API',
            version: '1.0.0',
        },
        servers:  [
            { url: '/api', description: 'API server' },
        ],
        security: [
            { ApiToken: [] },
        ],
        paths,
        components: {
            securitySchemes: {
                ApiToken: {
                    type: 'apiKey',
                    in:   'header',
                    name: 'X-Api-Token',
                },
            },
            schemas:   componentSchemas,
            responses: buildComponentsResponses(),
        },
    };
}


module.exports = { generate };
