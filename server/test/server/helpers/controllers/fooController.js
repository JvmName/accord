const { ServerController } = require('../../../../lib/server');


class FooController extends ServerController {
    postIndex() {}
    getFooBar() {}
    getBazBan() {}
    postFooBar() {}
    putFooBar() {}
    deleteFooBar() {}
    patchFooBar() {}
    notAnAction() {}

    static get routes() {
        return {getBazBan: '/baz/:id/ban'};
    }


    setupCallbacks() {
        this.beforeCallback('beforeCallback1', {only: 'postIndex'});
        this.beforeCallback('beforeCallback2');
        this.beforeCallback('beforeCallback3', {except: ['getFooBar', 'getBazBan']});
        this.beforeCallback('beforeCallback4', {only: 'putFooBar'});
        this.beforeCallback('beforeCallback5');

        this.afterCallback('afterCallback1');
        this.afterCallback('afterCallback2', {except: ['getFooBar', 'getBazBan']});
        this.afterCallback('afterCallback3', {only: 'postIndex'});
        this.afterCallback('afterCallback4', {only: 'deleteFooBar'});
        this.afterCallback('afterCallback5');
    }


    beforeCallback1() {}
    beforeCallback2() {}
    beforeCallback3() {}
    beforeCallback4() { return false; }
    beforeCallback5() {}

    afterCallback1() {}
    afterCallback2() {}
    afterCallback3() {}
    afterCallback4() { return false; }
    afterCallback5() {}
}


module.exports = { FooController };
