const { io }     = require('socket.io-client');
const { logger } = require('../logger');


class Worker {
    #closed = false;
    #host;
    #ioClient;
    #port;
    #timeout;
    #workerToken;


    constructor(workerToken, { port, host }={}) {
        this.#host       = host || process.env.HOST || 'localhost';
        this.#port       = port || process.env.PORT || 3000;
        this.#workerToken = workerToken;
    }


    async start() {
        await this.connect();
        this.queueJob();
    }


    async connect() {
        const socket = io(`${this.#host}:${this.#port}`, {
            query: {workerToken: this.#workerToken}
        });
        socket.on("connect", () => {console.log("Web socket connected")});
        socket.on("disconnect", () => {console.log("Web socket disconnected")});
    }


    close() {
        if (this.#timeout)  clearTimeout(this.#timeout);
        if (this.#ioClient) this.#ioClient.close();
        this.#closed = true;
    }


    queueJob() {
        const requeueInterval = 1000;
        this.#timeout = setTimeout(this.performJob.bind(this), requeueInterval);
    }


    performJob() {
        if (this.#closed) return;
        logger.info('hello world');
        this.queueJob();
    }
}


module.exports = {
    Worker
}
