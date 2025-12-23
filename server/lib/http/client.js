const { logger }    = require('../logger');
const { HttpError } = require('./error');


class HttpClient {
    async get(endpoint, { requestParams, headers }={}) {
        return await this.#makeRequest(endpoint, "GET", arguments[1]);
    }


    async post(endpoint, { body, headers }={}) {
        return await this.#makeRequest(endpoint, "POST", arguments[1]);
    }


    async put(endpoint, { body, headers }={}) {
        return await this.#makeRequest(endpoint, "PUT", arguments[1]);
    }


    async delete(endpoint, { requestParams, headers }={}) {
        return await this.#makeRequest(endpoint, "DELETE", arguments[1]);
    }


    async #makeRequest(endpoint, method, { requestParams, body, headers }={}) {
        this.#logRequest(method, endpoint);

        endpoint            = `${this.urlRoot}${endpoint}`;
        const url           = new URL(endpoint);
        const requestData   = structuredClone(requestParams || body || {});
        const payload       = this.#prepareRequestPayload(url, requestData, headers, method);

        const res  = await fetch(url.toString(), payload);

        if (res.status && res.status < 300) {
            const json = await res.json();
            return {data: json, status: res.status};
        } else {
            throw new HttpError(res, payload);
        }
    }


    #prepareRequestPayload(url, requestData, headers, method) {
        const payload = {};

        headers       ||= {};
        payload.headers = {...this.defaultHeaders, ...headers};
        payload.method  = method;
        this.#addRequestData(payload, requestData, method, url, payload.headers);

        return payload;
    }


    #addRequestData(payload, requestData, method, url, headers) {
        if (method == "POST" || method == "PUT") {
            payload.body = JSON.stringify(requestData || {});
        } else {
            this.#addUrlRequestData(url, requestData, headers);
        }
    }

    #addUrlRequestData(url, requestData, headers) {
        const contentType = headers['Content-Type'];
        if (contentType == 'application/json') {
            this.#addJsonUrlRequestData(requestData, url);
        } else if (contentType == 'application/x-www-form-urlencoded') {
            this.#addFormUrlRequestData(requestData, url);
        }
    }


    #addJsonUrlRequestData(requestData, url) {
        Object.entries(requestData).forEach(([paramName, val]) => {
            if (typeof val == 'object') {
                val = JSON.stringify(val);
            }
            url.searchParams.set(paramName, val);
        });
    }


    #addFormUrlRequestData(requestData, url) {
        Object.entries(requestData).forEach(([paramName, val]) => {
            this.#appendUrlRequestValue(paramName, val, url)
        });
    }


    #appendUrlRequestValue(paramName, val, url) {
        if (Array.isArray(val)) {
            val.forEach(v => url.searchParams.append(paramName, v));

        } else if (typeof val == 'object') {
            for (const [subParamName, subValue] of Object.entries(val)) {
                this.#appendUrlRequestValue(`${paramName}[${subParamName}]`, val, formData);
            };

        } else {
            url.searchParams.append(paramName, val);
        }
    }


    #logRequest(method, endpoint) {
        logger.info(`API CALL: ${method} ${endpoint}`);
    }


    get defaultHeaders() {
        return {
            Accept: "application/json",
            "Content-Type": "application/json",
        }
    }


    get urlRoot() {
        return "";
    }
}


module.exports = { 
  HttpClient,
  HttpError
}
