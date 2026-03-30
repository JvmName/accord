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
        this.#ioClient = io(`http://${this.#host}:${this.#port}`, {
            query: {workerToken: this.#workerToken}
        });
        this.#ioClient.on("connect",    () => { logger.info("Web socket connected")});
        this.#ioClient.on("disconnect", () => { logger.info("Web socket disconnected")});
    }


    async notifyServer(event, msg) {
       this.#ioClient.emit(event, msg); 
    }


    close() {
        if (this.#timeout)  clearTimeout(this.#timeout);
        if (this.#ioClient) this.#ioClient.close();
        this.#closed = true;
    }


    queueJob() {
        const requeueInterval = 1000;
        this.#timeout = setTimeout(this._performJob.bind(this), requeueInterval);
    }


    async _performJob() {
        if (this.#closed) return;
        await this.performJob();
        this.queueJob();
    }


    async performJob() {}
}


module.exports = {
    Worker
}
