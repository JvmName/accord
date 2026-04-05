const TestHelpers        = require('../helpers');
const { WorkerWebSocket } = require('../../lib/server/workerWebSocket');


const socketId = TestHelpers.Faker.Text.randomString();
const ioSocket = {adapter:    {on: jest.fn(), eventNames: jest.fn(() => [])},
                  eventNames: jest.fn(() => []),
                  close:      jest.fn(),
                  id:         socketId,
                  handshake:  {query: {}},
                  on:         jest.fn()};
const server   = {emit: jest.fn()};


afterEach(() => {
    ioSocket.on.mockReset();
    server.emit.mockReset();
});


describe('WorkerWebSocket', () => {
    const socket = new WorkerWebSocket(ioSocket, server);


    describe('WorkerWebSocket#addEventHandlers', () => {
        it ('registers round.tech-fall and match.update event handlers', async () => {
            const onSpy = jest.spyOn(socket, 'on');

            await socket.init();

            expect(onSpy).toHaveBeenCalledWith('round.tech-fall', expect.any(Function));
            expect(onSpy).toHaveBeenCalledWith('match.update',    expect.any(Function));

            onSpy.mockRestore();
        });
    });


    describe('round.tech-fall handler', () => {
        it ('emits to the match room with the match payload', () => {
            const match = {id: TestHelpers.Faker.Text.randomString()};

            socket.addEventHandlers();

            const [[, techFallHandler]] = ioSocket.on.mock.calls.filter(([event]) => event === 'round.tech-fall');
            techFallHandler.call(socket, match);

            expect(server.emit).toHaveBeenCalledTimes(1);
            expect(server.emit).toHaveBeenCalledWith(`match:${match.id}`, 'round.tech-fall', match);
        });
    });


    describe('match.update handler', () => {
        it ('emits to the match room with the match payload', () => {
            const match = {id: TestHelpers.Faker.Text.randomString()};

            socket.addEventHandlers();

            const [[, matchUpdateHandler]] = ioSocket.on.mock.calls.filter(([event]) => event === 'match.update');
            matchUpdateHandler.call(socket, match);

            expect(server.emit).toHaveBeenCalledTimes(1);
            expect(server.emit).toHaveBeenCalledWith(`match:${match.id}`, 'match.update', match);
        });
    });
});
