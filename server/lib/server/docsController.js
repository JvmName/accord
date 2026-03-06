const { ServerController }              = require('./serverController');
const { getOpenApiSpec, getAsyncApiSpec } = require('../openapi');


class DocsController extends ServerController {

    formatJSONBody(body) {
        return body;
    }


    async getDocsJson() {
        const spec = getOpenApiSpec();
        await this.render(spec);
    }


    async getAsyncDocsJson() {
        const spec = getAsyncApiSpec();
        await this.render(spec);
    }


    async getDocs() {
        const html = `<!DOCTYPE html>
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
        await this.renderHtml(html);
    }


    static get routes() {
        return {
            getDocsJson:      '/docs.json',
            getAsyncDocsJson: '/async-docs.json',
            getDocs:          '/docs'
        };
    }
}


module.exports = { DocsController };
