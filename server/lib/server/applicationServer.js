const   CONSTANTS          = require('../constants');
const { logger }           = require('../logger');
const { AuthorizationError,
        ValidationError }  = require('./serverController');


// How a request reached a ServerController action (callbacks, action, error
// mapping, render). The server no longer mounts any controller: every route
// is served by src/http, and the server itself is src/http/server.ts. This is
// kept, unmounted, for the old controllers and for the tests that pin their
// error mapping, until those controllers are deleted.
class LegacyControllerDispatch {

    get logger() { return logger; }


    requestHandler(action, controllerCls) {
        return async function(request, response) {
            if (CONSTANTS.ENV != 'test') this.logger.info(`${controllerCls.name}#${action}`);
            const controllerInstance = this.buildController(controllerCls, request, response);
            await controllerInstance.setupRequestState();

            if (controllerInstance.rendered) {
                response.end();
                return;
            }

            controllerInstance.setupCallbacks();

            const responseBody = await this.performRequest(controllerInstance, action);

            if (!controllerInstance.rendered) {
                await controllerInstance.render(responseBody || {});
            }

            response.end();
        }.bind(this);
    }


    async performRequest(controllerInstance, action) {
        try {
            return await this._performRequest(controllerInstance, action);
        } catch(err) {
            await this.handleError(err, controllerInstance);
        }
    }


    async handleError(err, controllerInstance) {
        if (err.name == 'SequelizeUniqueConstraintError') {
            const errors = {};
            for (const activeRecordError of err.errors) {
                errors[activeRecordError.path] = errors[activeRecordError.path] || [];
                errors[activeRecordError.path].push(activeRecordError.message);
            }
            if (err.parent) errors[null] = err.parent.message;
            await controllerInstance.renderErrors(errors);

        } else if (err.constructor == AuthorizationError) {
            await controllerInstance.renderUnauthorizedResponse();
            return;

        } else if (err.constructor == ValidationError) {
            await controllerInstance.renderErrors(err.errors);
            return;

        } else {
            controllerInstance.statusCode = 500;
            await controllerInstance.render({error: err.message});
        }

        if (CONSTANTS.DEV) logger.error(err);
    }


    async _performRequest(controllerInstance, action) {
        if (await controllerInstance.runBeforeCallbacks(action) === false) return false;
        const responseBody = await controllerInstance[action]();
        if (await controllerInstance.runAfterCallbacks(action) === false)  return false;

        return responseBody;
    }


    buildController(controllerCls, request, response) {
        return new controllerCls(request, response);
    }
}


module.exports = {
    LegacyControllerDispatch,
    // The old name, still imported by the unmodified characterization test of
    // the legacy error mapping. It is not a server: it has no listen().
    ApplicationServer: LegacyControllerDispatch,
}
