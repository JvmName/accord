const { Match }      = require('../../../models/match');


const MATCH_UPDATER_TIMEOUTS = {};
const MATCH_UPDATE_INTERVAL  = 1000;
let   WEB_SOCKET_SERVER;


function addMatchEventHandlers(webSocket, webSocketServer) {
    WEB_SOCKET_SERVER = webSocketServer;

    webSocket.on('match.join',  handleMatchJoined.bind(webSocket));
    webSocket.on('match.leave', handleMatchLeft.bind(webSocket));
}


async function handleMatchJoined(matchId) {
    const match = await Match.find(matchId)
    if (!await this.authorizer.can('view', match)) return;

    this.join(roomForMatch(matchId));
    queueMatchUpdate(matchId);
}


function handleMatchLeft(matchId) {
    this.leave(roomForMatch(matchId));
}


function queueMatchUpdate(matchId) {
    if (MATCH_UPDATER_TIMEOUTS[matchId]) return;

    const room       = roomForMatch(matchId);
    const numClients = WEB_SOCKET_SERVER.numClientsInRoom(room)
    if (!numClients) return;

    MATCH_UPDATER_TIMEOUTS[matchId] = setTimeout(async () => {
        const match = await Match.find(matchId);
        if (match)    await emitMatchUpdate(match);
        MATCH_UPDATER_TIMEOUTS[matchId] = null;
        if (match)    queueMatchUpdate(matchId);
    }, MATCH_UPDATE_INTERVAL);
}


async function emitMatchUpdate(match) {
    const options = {
      includeMat:         true,
      includeMatchJudges: true,
      includeRounds:      true
    };
    const apiResponse = await match.toApiResponse(options);

    const room = roomForMatch(match.id);
    WEB_SOCKET_SERVER.emit(room, 'match.update', apiResponse);
}


const roomForMatch = (matchId) => `match:${matchId}`;


module.exports = {
    addMatchEventHandlers
}
