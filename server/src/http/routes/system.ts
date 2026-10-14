/**
 * System routes (version banner, health check) and the DEV-only API docs.
 */
import { z } from 'zod';
import { routeResponses } from '../../contract/responses';
import { version } from '../../../package.json';
import { defineRoute } from '../route';

/** The version banner: a bare string inside the envelope. */
export const getRoot = defineRoute({
    method:    'get',
    path:      '/',
    authorize: { scope: 'none', level: 'public' },
    response:  routeResponses['GET /'],
    tags:      ['system'],
    openapi:   { description: 'Version banner.' },
    handler:   async () => `Hello World v${version}`,
});

/** Platform health checks call this; it renders `{}` (not null) inside the envelope. */
export const getHealthCheck = defineRoute({
    method:    'get',
    path:      '/system/healthCheck',
    authorize: { scope: 'none', level: 'public' },
    response:  routeResponses['GET /system/healthCheck'],
    tags:      ['system'],
    openapi:   { description: 'Liveness probe.' },
    handler:   async () => ({}),
});

let openApiDocument: unknown;
let asyncApiDocument: unknown;

/**
 * The OpenAPI document generated from the route definitions, built on first
 * use. Required lazily: the generator imports this route table, and its
 * library is a dev dependency that production never loads.
 */
export function generatedOpenApiDocument(): unknown {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    openApiDocument ??= require('../../contract/openapi').generateOpenApiDocument();
    return openApiDocument;
}

function asyncApiSpec(): unknown {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    asyncApiDocument ??= require('../../../lib/openapi/asyncApiGenerator').generate();
    return asyncApiDocument;
}

/** The OpenAPI document, sent raw, without the `{ data, status }` envelope. */
export const getDocsJson = defineRoute({
    method:    'get',
    path:      '/docs.json',
    authorize: { scope: 'none', level: 'public' },
    response:  z.unknown(),
    render:    'json',
    devOnly:   true,
    tags:      ['docs'],
    handler:   async () => generatedOpenApiDocument(),
});

/** The AsyncAPI document for the WebSocket events, sent raw. */
export const getAsyncDocsJson = defineRoute({
    method:    'get',
    path:      '/async-docs.json',
    authorize: { scope: 'none', level: 'public' },
    response:  z.unknown(),
    render:    'json',
    devOnly:   true,
    tags:      ['docs'],
    handler:   async () => asyncApiSpec(),
});

const DOCS_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
    <link rel="stylesheet" href="https://unpkg.com/@asyncapi/react-component@latest/styles/default.min.css" />
    <style>
        body { margin: 0; font-family: sans-serif; }
        .tabs { display: flex; background: #1b1b1b; padding: 0 16px; }
        .tab { padding: 14px 24px; cursor: pointer; color: #ccc; border-bottom: 3px solid transparent; font-size: 14px; }
        .tab.active { color: #fff; border-bottom-color: #61affe; }
        .panel { display: none; }
        .panel.active { display: block; }
    </style>
</head>
<body>
    <div class="tabs">
        <div class="tab active" onclick="switchTab('http')">HTTP</div>
        <div class="tab" onclick="switchTab('ws')">WebSocket</div>
    </div>
    <div id="panel-http" class="panel active">
        <div id="swagger-ui"></div>
    </div>
    <div id="panel-ws" class="panel">
        <div id="asyncapi"></div>
    </div>
    <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/@asyncapi/react-component@latest/browser/standalone/index.js"></script>
    <script>
        SwaggerUIBundle({
            url: '/docs.json',
            dom_id: '#swagger-ui',
            presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
            layout: 'BaseLayout'
        });

        fetch('/async-docs.json')
            .then(r => r.json())
            .then(schema => {
                AsyncApiStandalone.render({ schema, config: {} }, document.getElementById('asyncapi'));
            });

        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach((el, i) => {
                el.classList.toggle('active', (i === 0) === (tab === 'http'));
            });
            document.getElementById('panel-http').classList.toggle('active', tab === 'http');
            document.getElementById('panel-ws').classList.toggle('active', tab === 'ws');
        }
    </script>
</body>
</html>`;

/** Swagger UI (HTTP) and the AsyncAPI viewer (WebSocket) on one page. */
export const getDocs = defineRoute({
    method:    'get',
    path:      '/docs',
    authorize: { scope: 'none', level: 'public' },
    response:  z.string(),
    render:    'html',
    devOnly:   true,
    tags:      ['docs'],
    handler:   async () => DOCS_PAGE,
});

export const systemRoutes = [getRoot, getHealthCheck] as const;
export const docsRoutes   = [getDocsJson, getAsyncDocsJson, getDocs] as const;
