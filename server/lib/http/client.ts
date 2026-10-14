import type { Logger } from 'pino';

const { logger }: { logger: Logger } = require('../logger');
const { HttpError } = require('./error');


type HttpHeaders    = Record<string, string>;
type RequestData    = Record<string, any>;

interface RequestOptions {
    requestParams?: RequestData;
    body?:          RequestData;
    headers?:       HttpHeaders;
}

interface RequestPayload {
    headers: HttpHeaders;
    method:  string;
    body?:   string;
}

interface HttpResponse<T = any> {
    data:   T;
    status: number;
}


class HttpClient {
    async get(endpoint: string, { requestParams, headers }: RequestOptions={}): Promise<HttpResponse> {
        return await this.#makeRequest(endpoint, "GET", arguments[1]);
    }


    async post(endpoint: string, { body, headers }: RequestOptions={}): Promise<HttpResponse> {
        return await this.#makeRequest(endpoint, "POST", arguments[1]);
    }


    async put(endpoint: string, { body, headers }: RequestOptions={}): Promise<HttpResponse> {
        return await this.#makeRequest(endpoint, "PUT", arguments[1]);
    }


    async delete(endpoint: string, { requestParams, headers }: RequestOptions={}): Promise<HttpResponse> {
        return await this.#makeRequest(endpoint, "DELETE", arguments[1]);
    }


    async #makeRequest(endpoint: string, method: string, { requestParams, body, headers }: RequestOptions={}): Promise<HttpResponse> {
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


    #prepareRequestPayload(url: URL, requestData: RequestData, headers: HttpHeaders | undefined, method: string): RequestPayload {
        const payload = {} as RequestPayload;

        headers       ||= {};
        payload.headers = {...this.defaultHeaders, ...headers};
        payload.method  = method;
        this.#addRequestData(payload, requestData, method, url, payload.headers);

        return payload;
    }


    #addRequestData(payload: RequestPayload, requestData: RequestData, method: string, url: URL, headers: HttpHeaders): void {
        if (method == "POST" || method == "PUT") {
            payload.body = JSON.stringify(requestData || {});
        } else {
            this.#addUrlRequestData(url, requestData, headers);
        }
    }

    #addUrlRequestData(url: URL, requestData: RequestData, headers: HttpHeaders): void {
        const contentType = headers['Content-Type'];
        if (contentType == 'application/json') {
            this.#addJsonUrlRequestData(requestData, url);
        } else if (contentType == 'application/x-www-form-urlencoded') {
            this.#addFormUrlRequestData(requestData, url);
        }
    }


    #addJsonUrlRequestData(requestData: RequestData, url: URL): void {
        Object.entries(requestData).forEach(([paramName, val]) => {
            if (typeof val == 'object') {
                val = JSON.stringify(val);
            }
            url.searchParams.set(paramName, val);
        });
    }


    #addFormUrlRequestData(requestData: RequestData, url: URL): void {
        Object.entries(requestData).forEach(([paramName, val]) => {
            this.#appendUrlRequestValue(paramName, val, url)
        });
    }


    #appendUrlRequestValue(paramName: string, val: any, url: URL): void {
        if (Array.isArray(val)) {
            val.forEach(v => url.searchParams.append(paramName, v));

        } else if (typeof val == 'object') {
            for (const [subParamName, subValue] of Object.entries(val)) {
                // @ts-expect-error -- `formData` is undeclared (latent bug, see FINDINGS F-31); behavior intentionally unchanged
                this.#appendUrlRequestValue(`${paramName}[${subParamName}]`, val, formData);
            };

        } else {
            url.searchParams.append(paramName, val);
        }
    }


    #logRequest(method: string, endpoint: string): void {
        logger.info(`API CALL: ${method} ${endpoint}`);
    }


    get defaultHeaders(): HttpHeaders {
        return {
            Accept: "application/json",
            "Content-Type": "application/json",
        }
    }


    get urlRoot(): string {
        return "";
    }
}


module.exports = { 
  HttpClient,
  HttpError
}
