// Startup validator for OpenAPI annotations.
// Runs in development to catch missing documentation and broken $ref values
// before any requests are made. Runtime validation is handled separately by
// express-openapi-validator middleware.

const fs              = require('fs');
const path            = require('path');
const { logger }      = require('../logger');
const schemas         = require('./schemas');
const webSocketEvents = require('./webSocketEvents');

const MATCH_EVENT_HANDLERS_PATH = path.resolve(
    __dirname,
    '../server/webSocket.js'
);


/**
 * Recursively walk an object and call `visitor` for every object node that has
 * a `$ref` key.
 */
function walkRefs(node, visitor) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (const item of node) walkRefs(item, visitor);
        return;
    }
    if (Object.prototype.hasOwnProperty.call(node, '$ref')) {
        visitor(node['$ref']);
    }
    for (const value of Object.values(node)) {
        walkRefs(value, visitor);
    }
}


/**
 * Validate an array of controller classes.
 * Logs [docs] warnings for:
 *   - Actions that have no openapi annotation
 *   - Response $ref values that do not resolve to a known schema
 *   - WebSocket events declared in the registry but not referenced in matchEventHandlers.js
 */
function validate(controllerClasses) {
    // --- HTTP controller / action checks ---
    for (const ControllerClass of controllerClasses) {
        const openapi = ControllerClass.openapi || {};

        for (const { action: actionName } of ControllerClass.actions) {
            const annotation = openapi[actionName];

            if (!annotation) {
                logger.warn(`[docs] ${ControllerClass.name}#${actionName} is undocumented`);
                continue;
            }

            const response = annotation.response;
            if (!response) continue;

            walkRefs(response, (ref) => {
                // Refs may be short names ("Match") or full paths ("#/components/schemas/Match").
                // Extract just the schema name from either form.
                const schemaName = ref.split('/').pop();
                if (!Object.prototype.hasOwnProperty.call(schemas, schemaName)) {
                    logger.warn(
                        `[docs] ${ControllerClass.name}#${actionName}: response $ref "${ref}" does not match any known schema`
                    );
                }
            });
        }
    }

    // --- WebSocket event checks ---
    let handlersSource;
    try {
        handlersSource = fs.readFileSync(MATCH_EVENT_HANDLERS_PATH, 'utf8');
    } catch (err) {
        logger.warn(`[docs] Could not read matchEventHandlers.js for WebSocket event validation: ${err.message}`);
        return;
    }

    for (const event of webSocketEvents) {
        if (!handlersSource.includes(event.name)) {
            logger.warn(`[docs] WebSocket event "${event.name}" is declared in the registry but not referenced in matchEventHandlers.js`);
        }
    }
}


module.exports = { validate };
