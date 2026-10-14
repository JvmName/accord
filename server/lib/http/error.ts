/** The subset of the fetch `Response` that HttpError reads. */
type ErrorResponse = Pick<Response, 'status' | 'statusText' | 'headers' | 'url' | 'text'>;

class HttpError extends Error {
    #requestPayload: unknown;
    #response: ErrorResponse;


    constructor(response: ErrorResponse, requestPayload?: unknown) {
        super();
        this.#response       = response;
        this.#requestPayload = requestPayload;
    }


    get message()         { return `HTTP Error: ${this.status}`};
    get status()          { return this.#response.status; }
    get statusText()      { return this.#response.statusText; }
    get responseHeaders() { return structuredClone(this.#response.headers); }
    get requestPayload()  { return structuredClone(this.#requestPayload); }
    get url()             { return this.#response.url; }


    async data(): Promise<unknown> {
        const body = await this.#response.text();
        try {
            return JSON.parse(body);
        } catch(err) {
            return body;
        }
    }
}


module.exports = {
  HttpError
}
