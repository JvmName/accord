// Central registry of WebSocket events for AsyncAPI documentation.
// This file is pure data — no logic, no imports from generators or validators.
// Each event object has: name, direction, description, payload (JSON Schema).

const webSocketEvents = [

  // Implemented in: server/lib/server/webSocket.js
  {
    name:        'match.join',
    direction:   'client->server',
    description: 'Client requests to join a match room to receive live match updates.',
    payload: {
      type:       'object',
      required:   ['matchId'],
      properties: {
        matchId: { type: 'integer', description: 'The ID of the match to join.' }
      }
    }
  },

  // Implemented in: server/lib/server/webSocket.js
  {
    name:        'match.leave',
    direction:   'client->server',
    description: 'Client requests to leave a match room and stop receiving live match updates.',
    payload: {
      type:       'object',
      required:   ['matchId'],
      properties: {
        matchId: { type: 'integer', description: 'The ID of the match to leave.' }
      }
    }
  },

  // Implemented in: server/lib/server/webSocket.js
  {
    name:        'match.update',
    direction:   'server->client',
    description: 'Server pushes the latest match state to all clients in the match room.',
    payload:     { $ref: '#/components/schemas/Match' }
  }

];

module.exports = webSocketEvents;
