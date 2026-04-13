const { MatchUpdateWorker } = require('../../lib/workerQueue/matchUpdateWorker');
const { Round }             = require('../../models/round');
const { Match }             = require('../../models/match');
const { EVENTS }            = require('../../lib/server/workerWebSocket');


jest.mock('../../models/round', () => ({
    Round: { getOpenRounds: jest.fn() }
}));

jest.mock('../../models/match', () => ({
    Match: { where: jest.fn().mockResolvedValue([]), find: jest.fn(), get Operators() { return { ne: Symbol('ne') }; } }
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


        it('sends a final update for a match that just left the active set', async () => {
            const fakeResponse = { id: 'match-1' };
            const fakeMatch    = { toApiResponse: jest.fn().mockResolvedValue(fakeResponse) };
            const fakeRound    = { match_id: 'match-1', getMatch: jest.fn().mockResolvedValue(fakeMatch) };

            // First tick: match-1 is active
            Round.getOpenRounds.mockResolvedValue([fakeRound]);
            await worker.performJob();

            // Second tick: match-1 is gone (ended)
            Round.getOpenRounds.mockResolvedValue([]);
            Match.find.mockResolvedValue(fakeMatch);
            worker.notifyServer.mockClear();
            jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000); // force broadcast throttle to allow
            await worker.performJob();

            expect(Match.find).toHaveBeenCalledWith('match-1');
            expect(worker.notifyServer).toHaveBeenCalledWith(EVENTS.MATCH_UPDATE, fakeResponse);
        });


        it('does not send a final update for a match that is still active', async () => {
            const fakeResponse = { id: 'match-1' };
            const fakeMatch    = { toApiResponse: jest.fn().mockResolvedValue(fakeResponse) };
            const fakeRound    = { match_id: 'match-1', getMatch: jest.fn().mockResolvedValue(fakeMatch) };

            Round.getOpenRounds.mockResolvedValue([fakeRound]);
            await worker.performJob();
            await worker.performJob();

            expect(Match.find).not.toHaveBeenCalled();
        });


        it('throttles regular broadcasts to ~1s but still emits the final update immediately', async () => {
            const fakeResponse = { id: 'match-1' };
            const fakeMatch    = { toApiResponse: jest.fn().mockResolvedValue(fakeResponse) };
            const fakeRound    = { match_id: 'match-1', getMatch: jest.fn().mockResolvedValue(fakeMatch) };

            const realNow = Date.now();
            // First tick at t=0 — broadcasts normally, sets lastBroadcastTime
            jest.spyOn(Date, 'now').mockReturnValue(realNow);
            Round.getOpenRounds.mockResolvedValue([fakeRound]);
            await worker.performJob();
            const firstTickCount = worker.notifyServer.mock.calls.length;

            // Second tick at t=500ms — within throttle window, no regular broadcast
            jest.spyOn(Date, 'now').mockReturnValue(realNow + 500);
            Round.getOpenRounds.mockResolvedValue([]);
            Match.find.mockResolvedValue(fakeMatch);
            worker.notifyServer.mockClear();
            await worker.performJob();

            // Only the final update should have fired, not a regular broadcast
            expect(Match.find).toHaveBeenCalledWith('match-1');
            expect(worker.notifyServer).toHaveBeenCalledTimes(1);
            expect(worker.notifyServer).toHaveBeenCalledWith(EVENTS.MATCH_UPDATE, fakeResponse);
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
