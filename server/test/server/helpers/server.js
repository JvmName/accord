const { ApplicationServer } = require('../../../lib/server');


class TestServer extends ApplicationServer {
    get controllerDirectories() {
        return [`${__dirname}/controllers`];
    }
}


module.exports = {
    TestServer
}

