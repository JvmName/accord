const { AbstractWebSocket } = require('./abstractWebSocket');


const EVENTS = {
    TECH_FALL:    'round.tech-fall',
    MATCH_UPDATE: 'match.update',
}


class WorkerWebSocket extends AbstractWebSocket {
    addEventHandlers() {
        this.on(EVENTS.TECH_FALL, (match) => {
            const room = this.roomForMatch(match.id);
            this.emitToRoom(room, EVENTS.TECH_FALL, match);
        });
        this.on(EVENTS.MATCH_UPDATE, (match) => {
            const room = this.roomForMatch(match.id);
            this.emitToRoom(room, EVENTS.MATCH_UPDATE, match);
        });
    }
}


module.exports = {
    EVENTS,
    WorkerWebSocket
};
