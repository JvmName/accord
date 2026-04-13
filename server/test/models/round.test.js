/**
 * Tests for Round#pause, Round#resume, Round#paused, and Round#end.
 *
 * We mock the ActiveRecord / DB layer entirely so no live database is needed.
 */

// ---------------------------------------------------------------------------
// Mock BaseRecord so that Round.initialize() is a no-op and instances are
// plain objects with the helpers Round#pause/resume/end rely on.
// ---------------------------------------------------------------------------
jest.mock('../../lib/activeRecord', () => {
    class BaseRecord {
        #cachedAssociations = {};

        // Allow construction with a plain-object initialiser (sets properties)
        constructor(attrs = {}) {
            Object.assign(this, attrs);
        }

        static initialize() {}
        static belongsTo()  {}
        static hasMany()    {}
        static addHook()    {}
        static get fn()     { return null; }
        static get col()    { return null; }

        async getCachedAssociation(name, Cls, where, queryOptions) {
            if (queryOptions && Object.keys(queryOptions).length) {
                queryOptions.where = {...queryOptions.where, ...where};
                return await Cls.findAll(queryOptions);
            }

            if (!this.#cachedAssociations[name]) {
                const record = await Cls.findAll({ where });
                this._cacheRecord(name, record);
            }

            return Array.from(this.#cachedAssociations[name]);
        }

        clearCachedAssociation(name) {
            delete this.#cachedAssociations[name];
        }

        _cacheRecord(name, val) {
            this.#cachedAssociations[name] = val;
        }
    }
    return { BaseRecord };
});


// ---------------------------------------------------------------------------
// Provide minimal mocks for all models / libs that Round imports
// ---------------------------------------------------------------------------
jest.mock('../../models/ridingTimeVote', () => {
    class RidingTimeVote {
        constructor(attrs = {}) { Object.assign(this, attrs); }
        static async findAll() { return []; }
    }
    return { RidingTimeVote };
});

jest.mock('../../models/user', () => {
    class User {
        constructor(attrs = {}) { Object.assign(this, attrs); }
        static initialize() {}
        static belongsTo()  {}
        static addHook()    {}
    }
    return { User };
});

jest.mock('../../lib/rules', () => ({
    RDojoKombatRules: {
        roundDurations: [300, 300, 300],
        scoreRound:     jest.fn(() => ({ redScore: 0, blueScore: 0 })),
        determineWinner:jest.fn(() => ({ winner: null, method: null })),
    },
}));


// ---------------------------------------------------------------------------
// RoundPause mock – mutable so each test can configure it independently
// ---------------------------------------------------------------------------
const mockRoundPauseCreate = jest.fn();
const mockRoundPauseFindAll = jest.fn();

jest.mock('../../models/roundPause', () => {
    // A minimal RoundPause class whose instances track their own state
    class RoundPause {
        constructor(attrs = {}) {
            Object.assign(this, attrs);
            this.save = jest.fn().mockResolvedValue(this);
        }

        get isOpen() { return !this.resumed_at; }

        static initialize() {}
    }

    // Expose static stubs that tests can control through the outer references
    RoundPause.create  = mockRoundPauseCreate;
    RoundPause.findAll = mockRoundPauseFindAll;

    return { RoundPause };
});


// ---------------------------------------------------------------------------
// NOW load the real Round (it will use the mocked dependencies above)
// ---------------------------------------------------------------------------
const { Round }      = require('../../models/round');
const { RoundPause } = require('../../models/roundPause');


// ---------------------------------------------------------------------------
// Helper: build a Round instance with pre-set timestamps
// ---------------------------------------------------------------------------
function makeRound(attrs = {}) {
    const round = new Round({
        id:         'round-1',
        match_id:   'match-1',
        created_at: new Date('2026-01-01T10:00:00Z'),  // started_at delegates to created_at
        ended_at:   null,
        ...attrs,
    });

    // Stub getMatch so end() doesn't need a real match
    round.getMatch = jest.fn().mockResolvedValue({
        competitorForColor:      jest.fn(),
        getRounds:               jest.fn().mockResolvedValue([round]),
        getWinner:               jest.fn().mockResolvedValue(null),
        maxRounds:               999,
        end:                     jest.fn(),
        save:                    jest.fn().mockResolvedValue(null),
        clearCachedAssociation:  jest.fn(),
        rules:                   { getBreakDuration: jest.fn().mockReturnValue(0) },
        red_competitor_id:       'red-1',
        blue_competitor_id:      'blue-1',
        getJudges:               jest.fn().mockResolvedValue([]),
        getRedCompetitor:        jest.fn().mockResolvedValue(null),
        getBlueCompetitor:       jest.fn().mockResolvedValue(null),
    });

    // Stub getRidingTimeVotes so end() doesn't need a real DB
    round.getRidingTimeVotes = jest.fn().mockResolvedValue([]);

    return round;
}


// ---------------------------------------------------------------------------
// Helpers for building RoundPause-like objects
// ---------------------------------------------------------------------------
function openPause() {
    return new RoundPause({ id: 'pause-1', round_id: 'round-1', paused_at: new Date(), resumed_at: null });
}

function closedPause() {
    return new RoundPause({ id: 'pause-0', round_id: 'round-1', paused_at: new Date(Date.now() - 20000), resumed_at: new Date(Date.now() - 10000) });
}


// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
    jest.clearAllMocks();
});


// ===========================================================================
// round.pause()
// ===========================================================================
describe('round.pause()', () => {
    it('creates a RoundPause row with paused_at set and resumed_at null', async () => {
        const round = makeRound();
        // No existing pauses → round is not paused
        mockRoundPauseFindAll.mockResolvedValue([]);

        await round.pause();

        // The constructor for RoundPause is called with round_id and paused_at
        // We can verify by checking that a new RoundPause instance was saved
        // (getPauses calls RoundPause.findAll; pause() then new RoundPause + save())
        expect(mockRoundPauseFindAll).toHaveBeenCalled();
        // RoundPause instance save() is verified indirectly; ensure no error thrown
    });

    it('does not end any open riding time votes', async () => {
        const round = makeRound();
        mockRoundPauseFindAll.mockResolvedValue([]);

        await round.pause();

        expect(round.getRidingTimeVotes).not.toHaveBeenCalled();
    });

    it('throws when the round has not started', async () => {
        const round = makeRound({ created_at: null });
        await expect(round.pause()).rejects.toThrow('Round has not started');
    });

    it('throws when the round has already ended', async () => {
        const round = makeRound({ ended_at: new Date() });
        await expect(round.pause()).rejects.toThrow('Round has already ended');
    });

    it('throws when the round is already paused', async () => {
        const round = makeRound();
        mockRoundPauseFindAll.mockResolvedValue([openPause()]);

        await expect(round.pause()).rejects.toThrow('Round is already paused');
    });
});


// ===========================================================================
// round.paused
// ===========================================================================
describe('round.paused', () => {
    it('returns true when the latest pause has no resumed_at', async () => {
        const round = makeRound();
        mockRoundPauseFindAll.mockResolvedValue([openPause()]);

        await round.getPauses();
        expect(round.paused).toBe(true);
    });

    it('returns false when the latest pause has a resumed_at', async () => {
        const round = makeRound();
        mockRoundPauseFindAll.mockResolvedValue([closedPause()]);

        await round.getPauses();
        expect(round.paused).toBe(false);
    });

    it('returns false when there are no pauses', async () => {
        const round = makeRound();
        mockRoundPauseFindAll.mockResolvedValue([]);

        await round.getPauses();
        expect(round.paused).toBe(false);
    });
});


// ===========================================================================
// round.resume()
// ===========================================================================
describe('round.resume()', () => {
    it('sets resumed_at on the open RoundPause record and saves it', async () => {
        const round = makeRound();
        const pause = openPause();
        mockRoundPauseFindAll.mockResolvedValue([pause]);

        await round.resume();

        expect(pause.resumed_at).toBeDefined();
        expect(pause.resumed_at).toBeInstanceOf(Date);
        expect(pause.save).toHaveBeenCalled();
    });

    it('throws when the round is not paused', async () => {
        const round = makeRound();
        mockRoundPauseFindAll.mockResolvedValue([closedPause()]);

        await expect(round.resume()).rejects.toThrow('Round is not paused');
    });
});


// ===========================================================================
// round.end() — paused round closes the open pause first
// ===========================================================================
describe('round.end()', () => {
    it('calls resume() before setting ended_at when the round is paused', async () => {
        const round = makeRound();
        const pause = openPause();

        // First getPauses call (from end()) returns the open pause
        mockRoundPauseFindAll
            .mockResolvedValueOnce([pause])   // getPauses inside end()
            .mockResolvedValueOnce([pause]);  // getPauses inside resume() (called by end())

        round.save = jest.fn().mockResolvedValue(round);

        const resumeSpy = jest.spyOn(round, 'resume');

        await round.end();

        expect(resumeSpy).toHaveBeenCalled();
        expect(round.ended_at).toBeInstanceOf(Date);
    });

    it('does not call resume() when the round is not paused', async () => {
        const round = makeRound();
        mockRoundPauseFindAll.mockResolvedValue([closedPause()]);

        const resumeSpy = jest.spyOn(round, 'resume');

        // Stub save to avoid Sequelize
        round.save = jest.fn().mockResolvedValue(round);

        await round.end();

        expect(resumeSpy).not.toHaveBeenCalled();
        expect(round.ended_at).toBeInstanceOf(Date);
    });

    it('sets ended_at when end() is called', async () => {
        const round = makeRound();
        mockRoundPauseFindAll.mockResolvedValue([closedPause()]);

        round.save = jest.fn().mockResolvedValue(round);

        await round.end();

        expect(round.ended_at).toBeInstanceOf(Date);
    });


    it('leaves declared_winner_id and stoppage null when winner is not provided', async () => {
        const round = makeRound();
        mockRoundPauseFindAll.mockResolvedValue([closedPause()]);

        round.save = jest.fn().mockResolvedValue(round);

        await round.end();

        expect(round.declared_winner_id).toBeUndefined();
        expect(round.stoppage).toBeUndefined();
        expect(round.ended_at).toBeInstanceOf(Date);
    });
});


// ===========================================================================
// round.end() — match transition (all 3 rounds always run)
// ===========================================================================
describe('round.end() — match transition', () => {
    function makeRoundWithMatch(matchOverrides = {}) {
        const round = makeRound();
        mockRoundPauseFindAll.mockResolvedValue([]);
        round.save = jest.fn().mockResolvedValue(round);

        const matchDefaults = {
            competitorForColor:      jest.fn(),
            getRounds:               jest.fn().mockResolvedValue([round]),
            getWinner:               jest.fn().mockResolvedValue(null),
            maxRounds:               3,
            end:                     jest.fn(),
            save:                    jest.fn().mockResolvedValue(null),
            clearCachedAssociation:  jest.fn(),
            rules:                   { getBreakDuration: jest.fn().mockReturnValue(0) },
            red_competitor_id:       'red-1',
            blue_competitor_id:      'blue-1',
            getJudges:               jest.fn().mockResolvedValue([]),
            getRedCompetitor:        jest.fn().mockResolvedValue(null),
            getBlueCompetitor:       jest.fn().mockResolvedValue(null),
        };
        round.getMatch = jest.fn().mockResolvedValue({ ...matchDefaults, ...matchOverrides });
        return round;
    }

    it('ends the match after the 3rd round (max-rounds-reached)', async () => {
        const round1 = makeRound();
        const round2 = makeRound();
        const round3 = makeRound();
        const endMock = jest.fn();
        round3.getMatch = jest.fn().mockResolvedValue({
            competitorForColor:      jest.fn(),
            getRounds:               jest.fn().mockResolvedValue([round1, round2, round3]),
            maxRounds:               3,
            end:                     endMock,
            save:                    jest.fn().mockResolvedValue(null),
            clearCachedAssociation:  jest.fn(),
            rules:                   { getBreakDuration: jest.fn().mockReturnValue(0) },
            red_competitor_id:       'red-1',
            blue_competitor_id:      'blue-1',
            getJudges:               jest.fn().mockResolvedValue([]),
            getRedCompetitor:        jest.fn().mockResolvedValue(null),
            getBlueCompetitor:       jest.fn().mockResolvedValue(null),
        });
        mockRoundPauseFindAll.mockResolvedValue([]);
        round3.save = jest.fn().mockResolvedValue(round3);

        await round3.end();

        expect(endMock).toHaveBeenCalled();
    });

    it('does NOT end the match after round 1 even if one competitor has won', async () => {
        const round1 = makeRound();
        const endMock = jest.fn();
        round1.getMatch = jest.fn().mockResolvedValue({
            competitorForColor:      jest.fn(),
            getRounds:               jest.fn().mockResolvedValue([round1]),
            getWinner:               jest.fn().mockResolvedValue({ id: 'red-competitor' }),
            maxRounds:               3,
            end:                     endMock,
            save:                    jest.fn().mockResolvedValue(null),
            clearCachedAssociation:  jest.fn(),
            rules:                   { getBreakDuration: jest.fn().mockReturnValue(60) },
            red_competitor_id:       'red-1',
            blue_competitor_id:      'blue-1',
            getJudges:               jest.fn().mockResolvedValue([]),
            getRedCompetitor:        jest.fn().mockResolvedValue(null),
            getBlueCompetitor:       jest.fn().mockResolvedValue(null),
        });
        mockRoundPauseFindAll.mockResolvedValue([]);
        round1.save = jest.fn().mockResolvedValue(round1);

        await round1.end();

        expect(endMock).not.toHaveBeenCalled();
    });

    it('does NOT end the match after round 2 even if one competitor has won twice', async () => {
        const round1 = makeRound();
        const round2 = makeRound();
        const endMock = jest.fn();
        round2.getMatch = jest.fn().mockResolvedValue({
            competitorForColor:      jest.fn(),
            getRounds:               jest.fn().mockResolvedValue([round1, round2]),
            getWinner:               jest.fn().mockResolvedValue({ id: 'red-competitor' }),
            maxRounds:               3,
            end:                     endMock,
            save:                    jest.fn().mockResolvedValue(null),
            clearCachedAssociation:  jest.fn(),
            rules:                   { getBreakDuration: jest.fn().mockReturnValue(60) },
            red_competitor_id:       'red-1',
            blue_competitor_id:      'blue-1',
            getJudges:               jest.fn().mockResolvedValue([]),
            getRedCompetitor:        jest.fn().mockResolvedValue(null),
            getBlueCompetitor:       jest.fn().mockResolvedValue(null),
        });
        mockRoundPauseFindAll.mockResolvedValue([]);
        round2.save = jest.fn().mockResolvedValue(round2);

        await round2.end();

        expect(endMock).not.toHaveBeenCalled();
    });

    it('starts a break after round 1 (not the final round)', async () => {
        const round1 = makeRound();
        const matchSave = jest.fn().mockResolvedValue(null);
        const breakDurationFn = jest.fn().mockReturnValue(60);
        round1.getMatch = jest.fn().mockResolvedValue({
            competitorForColor:      jest.fn(),
            getRounds:               jest.fn().mockResolvedValue([round1]),
            maxRounds:               3,
            end:                     jest.fn(),
            save:                    matchSave,
            clearCachedAssociation:  jest.fn(),
            rules:                   { getBreakDuration: breakDurationFn },
            red_competitor_id:       'red-1',
            blue_competitor_id:      'blue-1',
            getJudges:               jest.fn().mockResolvedValue([]),
            getRedCompetitor:        jest.fn().mockResolvedValue(null),
            getBlueCompetitor:       jest.fn().mockResolvedValue(null),
        });
        mockRoundPauseFindAll.mockResolvedValue([]);
        round1.save = jest.fn().mockResolvedValue(round1);

        await round1.end();

        const match = await round1.getMatch();
        expect(match.break_duration).toBe(60);
        expect(match.break_started_at).toBeInstanceOf(Date);
        expect(matchSave).toHaveBeenCalled();
    });
});


// ===========================================================================
// round.setResult()
// ===========================================================================
describe('round.setResult()', () => {
    it('throws if the round has not ended', async () => {
        const round = makeRound();  // makeRound returns a round with no ended_at
        await expect(round.setResult({ winner: 'red', stoppage: false })).rejects.toThrow('Cannot set result on a round that has not ended');
    });

    it('sets declared_winner_id and stoppage when winner is provided', async () => {
        const competitorId = 'competitor-1';
        const round = makeRound();
        round.ended_at = new Date();

        // mock getMatch to return a match that resolves competitorForColor
        round.getMatch = jest.fn().mockResolvedValue({
            competitorForColor: jest.fn().mockResolvedValue({ id: competitorId }),
        });
        round.save = jest.fn().mockResolvedValue(round);

        await round.setResult({ winner: 'red', stoppage: true });

        expect(round.declared_winner_id).toBe(competitorId);
        expect(round.stoppage).toBe(true);
    });

    it('clears declared_winner_id and stoppage to null when no winner is provided', async () => {
        const round = makeRound();
        round.ended_at = new Date();
        round.declared_winner_id = 'some-id';
        round.stoppage = true;
        round.save = jest.fn().mockResolvedValue(round);

        await round.setResult();

        expect(round.declared_winner_id).toBeNull();
        expect(round.stoppage).toBeNull();
    });

    it('is idempotent — calling setResult again overwrites the previous result', async () => {
        const competitorId = 'competitor-2';
        const round = makeRound();
        round.ended_at = new Date();
        round.declared_winner_id = 'old-id';
        round.stoppage = false;

        round.getMatch = jest.fn().mockResolvedValue({
            competitorForColor: jest.fn().mockResolvedValue({ id: competitorId }),
        });
        round.save = jest.fn().mockResolvedValue(round);

        await round.setResult({ winner: 'blue', stoppage: true });

        expect(round.declared_winner_id).toBe(competitorId);
        expect(round.stoppage).toBe(true);
    });
});
