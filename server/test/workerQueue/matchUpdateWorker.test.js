const { MatchUpdateWorker } = require('../../lib/workerQueue/matchUpdateWorker');
const { Round }             = require('../../models/round');
const { EVENTS }            = require('../../lib/server/workerWebSocket');


jest.mock('../../models/round', () => ({
    Round: { getOpenRounds: jest.fn() }
}));

jest.mock('../../models/match', () => ({
    Match: { where: jest.fn().mockResolvedValue([]), get Operators() { return { ne: Symbol('ne') }; } }
}));

// Prevent Worker constructor from touching socket.io-client
jest.mock('socket.io-client', () => ({ io: jest.fn(() => ({ on: jest.fn(), emit: jest.fn() })) }));

// Silence logger output during tests
jest.mock('../../lib/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() } }));


describe('MatchUpdateWorker', () => {
    let worker;

    beforeEach(() => {
        worker = new MatchUpdateWorker('test-worker-token');
        jest.spyOn(worker, 'notifyServer').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.clearAllMocks();
    });


    describe('MatchUpdateWorker#performJob', () => {
        it('fetches open rounds', async () => {
            Round.getOpenRounds.mockResolvedValue([]);

            await worker.performJob();

            expect(Round.getOpenRounds).toHaveBeenCalledTimes(1);
        });


        it('broadcasts one update per open round', async () => {
            const fakeResponse1 = { id: 'match-1' };
            const fakeResponse2 = { id: 'match-2' };

            const fakeMatch1 = { toApiResponse: jest.fn().mockResolvedValue(fakeResponse1) };
            const fakeMatch2 = { toApiResponse: jest.fn().mockResolvedValue(fakeResponse2) };

            const fakeRound1 = { getMatch: jest.fn().mockResolvedValue(fakeMatch1) };
            const fakeRound2 = { getMatch: jest.fn().mockResolvedValue(fakeMatch2) };

            Round.getOpenRounds.mockResolvedValue([fakeRound1, fakeRound2]);

            await worker.performJob();

            expect(worker.notifyServer).toHaveBeenCalledTimes(2);
            expect(worker.notifyServer).toHaveBeenCalledWith(EVENTS.MATCH_UPDATE, fakeResponse1);
            expect(worker.notifyServer).toHaveBeenCalledWith(EVENTS.MATCH_UPDATE, fakeResponse2);
        });


        it('calls toApiResponse with the correct render options', async () => {
            const fakeResponse = { id: 'match-1' };
            const fakeMatch    = { toApiResponse: jest.fn().mockResolvedValue(fakeResponse) };
            const fakeRound    = { getMatch: jest.fn().mockResolvedValue(fakeMatch) };

            Round.getOpenRounds.mockResolvedValue([fakeRound]);

            await worker.performJob();

            expect(fakeMatch.toApiResponse).toHaveBeenCalledTimes(1);

            const [renderOptions] = fakeMatch.toApiResponse.mock.calls[0];
            expect(renderOptions).toMatchObject({
                includeMat:          true,
                includeMatchJudges:  true,
                includeRounds:       true,
            });
            expect(renderOptions).not.toHaveProperty('includeJudges');
        });
    });
});
