const { camelize }   = require('inflection');
const { logger }     = require('../logger');
const { Authorizer } = require('./authorizer');
const { User }       = require('../../models/user');


class ServerController {
    #afterCallbacks  = [];
    #authorizer;
    #beforeCallbacks = [];
    #currentUser;
    #params;
    #rendered        = false;
    #request;
    #requestBody;
    #requestQuery;
    #response;


    constructor(request, response) {
        if (this.constructor == ServerController) {
            throw new Error("ServerControllers must be subclasses of ServerController");
        }
        this.#request  = request;
        this.#response = response;
    }


    get _request()        { return this.#request  };
    get _response()       { return this.#response };

    get params()          { 
        if (!this.#params) {
            const body   = this.#processRequestData('body');
            const query  = this.#processRequestData('query');
            this.#params = {...this._request.params, ...body, ...query};
        }
        return structuredClone(this.#params);
    }

    get requestHeaders()  { return structuredClone(this._request.headers || {}); }
    get responseHeaders() { return this._response.headers; };
    get contentType()     { return this.requestHeaders['content-type']; }
    get logger()          { return logger; }
    get rendered()        { return this.#rendered }

    get statusCode()          { return this._response.statusCode; }
    set statusCode(_status)   { this._response.statusCode = _status; }


    #processRequestData(key) {
        const instanceVarKey  = key.charAt(0).toUpperCase() + key.slice(1);
        const instanceVarName = `#request${instanceVarKey}`;
        const data            = this._request[key] || {};
        if (this[instanceVarName] === undefined) {
            const processedData = {};
            this[instanceVarName] = processedData;
            for (let [paramName, paramValue] of Object.entries(data)) {
                processedData[paramName] = this.#processedRequestDataValue(paramValue)
            }
        }

        return structuredClone(this[instanceVarName]);
    }


    #processedRequestDataValue(value) {
        try {
            return JSON.parse(value);
        } catch(err) {
            return value;
        }
    }


    async render(body) {
        body = await this.formatJSONBody(body);
        this._response.json(body);
        this.#rendered = true;
    }


    async renderErrors(errors) {
        this.statusCode = 400;
        await this.render({ errors });
    }


    renderNotFoundResponse() {
        this.statusCode = 404;
    }


    renderUnauthorizedResponse() {
        this.statusCode = 401;
    }


    async formatJSONBody(body) {
        body = await this._formatJSONBody(body);
        return {data: body, status: this.statusText};
    }


    async _formatJSONBody(body,depth=0) {
        if (!body || typeof body != 'object') return body;

        if (body.toApiResponse) {
            const formattedBody = await body.toApiResponse();
            return await this._formatJSONBody(formattedBody);

        } else if (Array.isArray(body)) {
            for (const idx in body) {
                body[idx] = await this._formatJSONBody(body[idx], depth+1);
            }

        } else {
            for (let [key, val] of Object.entries(body)) {
                body[key] = await this._formatJSONBody(val, depth+1);
            }
        }

        return body;
    }


    get statusText() {
        switch(this.statusCode) {
            case 200:
                return 'ok';
            case 400:
                return 'bad request'
            case 401:
                return 'unauthorized';
            case 404:
                return 'not found';
            case 500:
                return 'server error';
        }
    }


    /***********************************************************************************************
    * CALLBACKS
    ***********************************************************************************************/
    async setupRequestState() {}
    setupCallbacks()          {}


    beforeCallback(callback, options={}) {
        this.#addCallback(callback, options, this.#beforeCallbacks);
    }


    afterCallback(callback, options={}) {
        this.#addCallback(callback, options, this.#afterCallbacks);
    }


    #addCallback(callback, options, callbacksList) {
        callbacksList.push({ callback, options });
    }


    async runBeforeCallbacks(actionName) {
        return await this.#runCallbacks(this.#beforeCallbacks, actionName);
    }


    async runAfterCallbacks(actionName) {
        return await this.#runCallbacks(this.#afterCallbacks, actionName);
    }


    async #runCallbacks(callbacksList, actionName) {
        for (const  { callback, options } of callbacksList) {
            if (!this.#shouldRunCallback(actionName, options)) continue;
            if (await this[callback]() === false) return false;
        }

        return true;
    }


    #shouldRunCallback(actionName, options) {
        if (options.only) {
            if (Array.isArray(options.only)) return options.only.includes(actionName);
            return options.only == actionName;
        }

        if (options.except) {
            if (Array.isArray(options.except)) return !options.except.includes(actionName);
            return options.except != actionName;
        }

        return true;
    }


    /***********************************************************************************************
    * VALIDATIONS
    ***********************************************************************************************/
    async validateParameters(validations) {
        const errors = {};
        for (const [parameterName, parameterValidations] of Object.entries(validations)) {
            const parameterErrors = this.validateParameter(this.params[parameterName], parameterValidations);
            if (parameterErrors.length) errors[parameterName] = parameterErrors;
        }

        if (Object.keys(errors).length) {
            await this.renderErrors(errors);
            return false;
        }

        return true;
    }


    validateParameter(value, parameterValidations) {
      const errors = [];
      for (const [validationType, validationOptions] of Object.entries(parameterValidations)) {
          const validationMethod = `validate${camelize(validationType)}`;
          const error = this[validationMethod](value, validationOptions);
          if (error) errors.push(error);
      }

      return errors;
    }


    validateFunction(value, fnc) {
        const error = fnc(value);
        if (error) return error;
    }


    validateIsEnum(value, options) {
        if (!options.enums.includes(value)) return options.error || `must be one of [${options.enums.join(', ')}]`;
    }


    validateIsDateTime(value) {
        if (new Date(value) == 'Invalid Date') return 'invalid date';
    }


    validateIsEmail(value) {
        const regExp = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+(\.[a-zA-Z]{2,})+$/;
        if (!regExp.test(String(value))) return 'invalid email';
    }


    validateIsInteger(value, options) {
        const num = parseFloat(value);
        if (/\D/.test(value) || isNaN(num) || !Number.isInteger(num)) return 'must be an integer';
        if (options && options.gte !== undefined) {
            if (num < options.gte) return `must be greater than or equal to ${options.gte}`;
        }
    }


    validatePresence(value) {
        if (!value) return 'required';
    }


    /***********************************************************************************************
    * AUTHENTICATION
    ***********************************************************************************************/
    async setupRequestState() {
        await this.#initCurrentUser();
    }


    async #initCurrentUser() {
        if (!this.apiToken) return;

        this.#currentUser = await User.findByApiToken(this.apiToken);
    }


    async authenticateRequest() {
        if (!this.currentUser) {
            await this.renderUnauthorizedResponse();
            return false;
        }
    }


    async authorize(action, scope) {
        if (!this.authorizer) throw new AuthorizationError();

        const authorized = await this.authorizer.can(action, scope)
        if (!authorized) throw new AuthorizationError();
    }


    get currentUser() { return this.#currentUser || null; }
    get apiToken()    { return this.requestHeaders['x-api-token']; }
    get authorizer()  {
        if (!this.currentUser) return;
        if (!this.#authorizer) this.#authorizer = new Authorizer(this.currentUser);
        return this.#authorizer;
    }


    /***********************************************************************************************
    * ACTION SETUP
    * The controller looks for any methods that fit the pattern of `{httpMethod}ActionName`
    * (e.g. getFooBar) and prepares server routes for them. By default, a method `getFooBar` on a
    * `BazController` would have an endpoint of  `GET /baz/fooBar`. The server will also prepend
    * directory names, so if `bazController.js` is nested within the `ban` directory
    * (e.g. `ban/bazController.js`), the endpoint will be `GET /ban/baz/fooBar`.
    *
    * Default routing logic can be overriden by defining custom routes in the `routes` getter. To
    * provider a custom route for `getFooBar`, `routes` should return an object like:
    * {getFooBar: '/ban/:accountIdd/foo/:userId/bar'}`
    ***********************************************************************************************/
    static get actions() {
        const actionNames = this.actionNames;
        return actionNames.map((actionName => {
            return this._constructAction(actionName);
        }).bind(this));
    }


    static _constructAction(actionName) {
        const routePrefix = this.routePrefix
        const action      = {};
        const match       = actionName.match(this.actionRegExp);

        action.method = match.groups.method.toUpperCase();
        action.action = actionName;
        action.path   = this._routeForAction(action.method, match.groups.path, routePrefix, actionName);
        return action;
    }


    static _routeForAction(method, path, routePrefix, actionName) {
        if (this.routes[actionName]) return this.routes[actionName];
        if (path == 'Index')         return routePrefix;

        path = path.charAt(0).toLowerCase() + path.slice(1);
        return `${routePrefix}/${path}`;
    }


    static get routePrefix() {
        const controllerName   = this.name.replace(/Controller$/, '');
        const controllerPrefix = controllerName.charAt(0).toLowerCase() + controllerName.slice(1);
        
        return `${this.directoryPrefix || ''}/${controllerPrefix}`;
    }


    static get routes() {
        return {};
    }


    static get actionNames() {
        const methodNames = Object.getOwnPropertyNames(this.prototype);
        const nameRegExp  = this.actionRegExp;
        return methodNames.filter(name => nameRegExp.test(name));
    }


    static get actionRegExp() {
        return new RegExp(/^(?<method>get|post|put|delete|patch)(?<path>[A-Z][a-zA-Z]+)$/);
    }
}


class AuthorizationError extends Error {}


module.exports = { 
    AuthorizationError,
    ServerController
};
