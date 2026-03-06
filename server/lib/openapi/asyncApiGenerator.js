// Generates an AsyncAPI 2.6 spec object from the WebSocket event registry.
// Call generate() to get the complete spec as a plain JS object.

const webSocketEvents = require('./webSocketEvents');
const schemas         = require('./schemas/index');

/**
 * Resolve a payload definition against the schemas index.
 * If the payload is a $ref pointing to #/components/schemas/<Name>, return the
 * schema name so it can be re-referenced inside the AsyncAPI components section.
 * Otherwise return the payload as-is (inline schema).
 *
 * Returns { payloadRef: string|null, inlinePayload: object|null }
 */
function resolvePayload(payload) {
  if (payload && payload.$ref) {
    // Extract schema name from "#/components/schemas/Match" -> "Match"
    const match = payload.$ref.match(/^#\/components\/schemas\/(\w+)$/);
    if (match) {
      return { payloadRef: match[1], inlinePayload: null };
    }
  }
  return { payloadRef: null, inlinePayload: payload };
}

/**
 * Build and return a complete AsyncAPI 2.6 spec object.
 */
function generate() {
  // Collect schemas that are actually referenced by events so we only include
  // what is needed (though including all is also valid).
  const referencedSchemaNames = new Set();

  // Build channels
  const channels = {};

  for (const event of webSocketEvents) {
    const { payloadRef, inlinePayload } = resolvePayload(event.payload);

    if (payloadRef) {
      referencedSchemaNames.add(payloadRef);
    }

    const messagePayload = payloadRef
      ? { $ref: `#/components/schemas/${payloadRef}` }
      : inlinePayload;

    const message = {
      name:        event.name,
      description: event.description,
      payload:     messagePayload
    };

    channels[event.name] = channels[event.name] || {};

    if (event.direction === 'client->server') {
      // Server subscribes to messages sent by the client
      channels[event.name].subscribe = { message };
    } else if (event.direction === 'server->client') {
      // Server publishes messages to the client
      channels[event.name].publish = { message };
    }
  }

  // Build components/schemas — include all schemas from the index so that any
  // $ref inside a schema body (e.g. Round referencing Match) can also resolve.
  const componentSchemas = {};
  for (const [name, schema] of Object.entries(schemas)) {
    componentSchemas[name] = schema;
  }

  return {
    asyncapi: '2.6.0',
    info: {
      title:   'Accord API (WebSocket)',
      version: '1.0.0'
    },
    servers: {
      production: {
        url:         'localhost:3000',
        protocol:    'ws',
        description: 'Socket.IO WebSocket server (same host/port as the HTTP API)'
      }
    },
    channels,
    components: {
      schemas: componentSchemas
    }
  };
}

module.exports = { generate };
