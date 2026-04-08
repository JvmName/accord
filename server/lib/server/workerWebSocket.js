const { AbstractWebSocket } = require('./abstractWebSocket');
const { logger }            = require('../logger');


const EVENTS = {
    TECH_FALL:   'round.tech-fall',
    MATCH_UPDATE: 'match.update',
    BREAK_ENDED:  'break.ended',
}


class WorkerWebSocket extends AbstractWebSocket {
    addEventHandlers() {
        this.on(EVENTS.TECH_FALL, (match) => {
            const room = this.roomForMatch(match.id);
            logger.info(`Emitting round.tech-fall to room match:${match.id}`);
            this.emitToRoom(room, EVENTS.TECH_FALL, match);
        });
        this.on(EVENTS.MATCH_UPDATE, (match) => {
            const room = this.roomForMatch(match.id);
            logger.debug(`Emitting match.update to room match:${match.id}`);
            this.emitToRoom(room, EVENTS.MATCH_UPDATE, match);
        });
        this.on(EVENTS.BREAK_ENDED, (match) => {
            const room = this.roomForMatch(match.id);
            logger.info(`Emitting break.ended to room match:${match.id}`);
            this.emitToRoom(room, EVENTS.BREAK_ENDED, match);
        });
    }
}


module.exports = {
    EVENTS,
    WorkerWebSocket
};
