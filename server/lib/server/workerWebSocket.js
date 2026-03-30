const { AbstractWebSocket } = require('./abstractWebSocket');


const EVENTS = {
    TECH_FALL: 'round.tech-fall'
}


class WorkerWebSocket extends AbstractWebSocket {
    addEventHandlers() {
        this.on(EVENTS.TECH_FALL, (match) => {
            const room = this.roomForMatch(match.id);
            this.emitToRoom(room, EVENTS.TECH_FALL, match);
        });
    }
}


module.exports = {
    EVENTS,
    WorkerWebSocket
};
