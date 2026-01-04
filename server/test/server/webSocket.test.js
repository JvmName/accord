const   TestHelpers = require('../helpers');
const { User }      = require('../../models/user');
const { WebSocket } = require('../../lib/server/webSocket');


const apiToken = TestHelpers.Faker.Text.randomString();
const socketId = TestHelpers.Faker.Text.randomString();
const ioSocket = {id: socketId, handshake: {auth: { apiToken }}, on: jest.fn()};
const user     = new User();


jest.mock('../../models/user', () => {
    class User {
        static findByApiToken = jest.fn();
    }
    return { User };
});


afterEach(() => {
    ioSocket.on.mockReset();
    User.findByApiToken.mockReset();
});


describe('WebSocket', () => {
    const socket = new WebSocket(ioSocket);

    describe('WebSocket#init', () => {
        it ('fetches a user with an api token', async () => {
            User.findByApiToken.mockImplementation(() => user);

            await socket.init();

            expect(User.findByApiToken).toHaveBeenCalledTimes(1);
            expect(User.findByApiToken).toHaveBeenCalledWith(apiToken);
            expect(socket.currentUser).toBe(user);
        });

        it ('throws an error if there is no user', async () => {
            await expect(async () => {
                await socket.init()
            }).rejects.toThrow();
        });

        it ('sets up a disconnection handler', async () => {
            User.findByApiToken.mockImplementation(() => user);
            const onSpy = jest.spyOn(socket, 'on');

            await socket.init();

            expect(onSpy).toHaveBeenCalledTimes(1);
            expect(onSpy).toHaveBeenCalledWith('disconnect', expect.any(Function));

            onSpy.mockRestore();
        });
        
    });


    describe('WebSocket#on', () => {
        it ('calls `on` on the underlying web socket', () => {
            const eventName    = TestHelpers.Faker.Text.randomString();
            const eventHandler = jest.fn();
            const bind         = jest.fn(() => eventHandler);

            socket.on(eventName, { bind });

            expect(ioSocket.on).toHaveBeenCalledTimes(1);
            expect(ioSocket.on).toHaveBeenCalledWith(eventName, eventHandler);
            expect(bind).toHaveBeenCalledTimes(1);
            expect(bind).toHaveBeenCalledWith(socket);
        });
    });


    describe('WebSocket#apiToken', () => {
        it ('returns the token fromt the io socket handshake', () => {
            expect(socket.apiToken).toEqual(apiToken);
        });
    });


    describe('WebSocket#id', () => {
        it ('returns the io socket id', () => {
            expect(socket.id).toEqual(socketId);
        });
    });

});
