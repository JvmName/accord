class AbstractWebSocket {
    #ioSocket;
    #server;


    constructor(ioSocket, server) {
        this.#ioSocket = ioSocket;
        this.#server   = server;
    }


    async init() {
        this.resetSocket();

        this.on('disconnect', ()     => { logger.info(`Web socket disconnected (${this.id})`) });
        this.on('room.join',  (room) => { this.join(room)  });
        this.on('room.leave', (room) => { this.leave(room) });

        this.#ioSocket.adapter.on('join-room',  this.#handleRoomJoined.bind(this));
        this.#ioSocket.adapter.on('leave-room', this.#handleRoomLeft.bind(this));

        addMatchEventHandlers(this, this.#server);
    }


    close() {
        this.#ioSocket.close();
    }


    resetSocket() {
        for (const eventName of this.#ioSocket.eventNames()) {
            this.#ioSocket.removeAllListeners(eventName);
        }
        for (const eventName of this.#ioSocket.adapter.eventNames()) {
            this.#ioSocket.adapter.removeAllListeners(eventName);
        }
    }


    /***********************************************************************************************
    * EVENTS
    ***********************************************************************************************/
    on(eventName, eventHandler) {
        this.#ioSocket.on(eventName, eventHandler.bind(this));
    }


    /***********************************************************************************************
    * ROOMS
    ***********************************************************************************************/
    join(room) {
        this.#ioSocket.join(room);
    }


    leave(room) {
        this.#ioSocket.leave(room);
    }


    #handleRoomJoined(room, id) {
        if (this.id == room) return;

        const numConnections = this.#ioSocket.adapter.rooms.get(room).size;
        logger.info(`Web socket joined room ${room}.${numConnections} - (${id})`);
    }


    #handleRoomLeft(room, id) {
        if (this.id == room) return;
        const numConnections = this.#ioSocket.adapter.rooms.get(room).size;
        logger.info(`Web socket left room ${room}.${numConnections} - (${id})`);
    }


    /***********************************************************************************************
    * AUTH
    ***********************************************************************************************/
    get apiToken() { return this.#ioSocket.handshake.query?.apiToken; }
    get id()       { return this.#ioSocket.id }
}


module.exports = {
    AbstractWebSocket
}
