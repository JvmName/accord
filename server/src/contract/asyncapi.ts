/**
 * AsyncAPI 2.6 document for the WebSocket events, served in development at
 * `/async-docs.json`. The event list is data; component schemas come from
 * the generated OpenAPI document so the two specs cannot drift.
 */
import { generateOpenApiDocument } from './openapi';

type Direction = 'client->server' | 'server->client';

interface WebSocketEvent {
    name:        string;
    direction:   Direction;
    description: string;
    payload:     Record<string, unknown>;
}

const matchIdPayload = (verb: string) => ({
    type:       'object',
    required:   ['matchId'],
    properties: {
        matchId: { type: 'integer', description: `The ID of the match to ${verb}.` },
    },
});

export const webSocketEvents: WebSocketEvent[] = [
    {
        name:        'match.join',
        direction:   'client->server',
        description: 'Client requests to join a match room to receive live match updates.',
        payload:     matchIdPayload('join'),
    },
    {
        name:        'match.leave',
        direction:   'client->server',
        description: 'Client requests to leave a match room and stop receiving live match updates.',
        payload:     matchIdPayload('leave'),
    },
    {
        name:        'match.update',
        direction:   'server->client',
        description: 'Server pushes the latest match state to all clients in the match room.',
        payload:     { $ref: '#/components/schemas/Match' },
    },
];

export function generateAsyncApiDocument(): Record<string, unknown> {
    const channels: Record<string, Record<string, unknown>> = {};

    for (const event of webSocketEvents) {
        const message = { name: event.name, description: event.description, payload: event.payload };
        channels[event.name] ??= {};
        // The server subscribes to what clients send and publishes what it emits.
        channels[event.name][event.direction === 'client->server' ? 'subscribe' : 'publish'] = { message };
    }

    return {
        asyncapi: '2.6.0',
        info:     { title: 'Accord API (WebSocket)', version: '1.0.0' },
        servers:  {
            production: {
                url:         'localhost:3000',
                protocol:    'ws',
                description: 'Socket.IO WebSocket server (same host/port as the HTTP API)',
            },
        },
        channels,
        components: { schemas: generateOpenApiDocument().components?.schemas ?? {} },
    };
}
