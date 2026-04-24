const { ServerController } = require('./serverController');
const { version } = require('../../package.json');


class SystemController extends ServerController {

    getHealthCheck() {
        this.render({});
    }


    getIndex() {
        this.render(`Hello World v${version}`);
    }


    static get routes() {
        return {getIndex: '/'};
    }

}


module.exports = { SystemController };
