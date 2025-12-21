const { ServerController } = require('./serverController');


class SystemController extends ServerController {

    getHealthCheck() {
        this.render({});
    }


    getIndex() {
        this.render('Hello World');
    }


    static get routes() {
        return {getIndex: '/'};
    }

}


module.exports = { SystemController };
