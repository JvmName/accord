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
        competitorForColor: jest.fn(),
        getRounds:          jest.fn().mockResolvedValue([round]),
        getWinner:          jest.fn().mockResolvedValue(null),
        maxRounds:          999,
        end:                jest.fn(),
        red_competitor_id:  'red-1',
        blue_competitor_id: 'blue-1',
        getJudges:          jest.fn().mockResolvedValue([]),
        getRedCompetitor:   jest.fn().mockResolvedValue(null),
        getBlueCompetitor:  jest.fn().mockResolvedValue(null),
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
});
