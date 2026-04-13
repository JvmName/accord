const { RDojoKombatRules } = require('../../lib/rules/rDojoKombat');

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const red  = { id: 'red-competitor-1' };
const blue = { id: 'blue-competitor-2' };

function endedRound(overrides = {}) {
    return { ended: true, declared_winner_id: null, stoppage: null, ...overrides };
}


// ===========================================================================
// techFallThreshold
// ===========================================================================
describe('RDojoKombatRules.techFallThreshold', () => {
    it('returns 24 for round 1', () => {
        expect(RDojoKombatRules.techFallThreshold(1)).toBe(24);
    });

    it('returns 16 for round 2', () => {
        expect(RDojoKombatRules.techFallThreshold(2)).toBe(16);
    });

    it('returns 8 for round 3', () => {
        expect(RDojoKombatRules.techFallThreshold(3)).toBe(8);
    });

    it('returns 8 for rounds beyond 3', () => {
        expect(RDojoKombatRules.techFallThreshold(4)).toBe(8);
        expect(RDojoKombatRules.techFallThreshold(10)).toBe(8);
    });
});


// ===========================================================================
// getBreakDuration
// ===========================================================================
describe('RDojoKombatRules.getBreakDuration', () => {
    it('returns 60 after round 1', () => {
        expect(RDojoKombatRules.getBreakDuration(1)).toBe(60);
    });

    it('returns 60 after round 2', () => {
        expect(RDojoKombatRules.getBreakDuration(2)).toBe(60);
    });

    it('returns 0 for out-of-bounds round index (before round 1)', () => {
        expect(RDojoKombatRules.getBreakDuration(0)).toBe(0);
    });

    it('returns 0 after round 3 (no break defined)', () => {
        expect(RDojoKombatRules.getBreakDuration(3)).toBe(0);
    });
});


// ===========================================================================
// determineWinner — basic branches
// ===========================================================================
describe('RDojoKombatRules.determineWinner — basic branches', () => {
    it('returns null winner and null method when round has not ended', () => {
        const round = { ended: false, declared_winner_id: null, stoppage: null };
        const { winner, method } = RDojoKombatRules.determineWinner(red, blue, 10, 5, 1, round);
        expect(winner).toBeNull();
        expect(method.type).toBeNull();
        expect(method.value).toBeNull();
    });

    it('returns red as winner with method submission when red has declared_winner_id and stoppage is false', () => {
        const round = endedRound({ declared_winner_id: red.id, stoppage: false });
        const { winner, method } = RDojoKombatRules.determineWinner(red, blue, 0, 0, 1, round);
        expect(winner).toBe(red);
        expect(method.type).toBe('submission');
        expect(method.value).toBeNull();
    });

    it('returns blue as winner with method submission when blue has declared_winner_id and stoppage is false', () => {
        const round = endedRound({ declared_winner_id: blue.id, stoppage: false });
        const { winner, method } = RDojoKombatRules.determineWinner(red, blue, 0, 0, 1, round);
        expect(winner).toBe(blue);
        expect(method.type).toBe('submission');
        expect(method.value).toBeNull();
    });

    it('returns red as winner with method stoppage when declared_winner_id is red and stoppage is true', () => {
        const round = endedRound({ declared_winner_id: red.id, stoppage: true });
        const { winner, method } = RDojoKombatRules.determineWinner(red, blue, 0, 0, 1, round);
        expect(winner).toBe(red);
        expect(method.type).toBe('stoppage');
    });

    it('returns points winner when scores differ and no declared_winner_id', () => {
        const round = endedRound();
        const { winner, method } = RDojoKombatRules.determineWinner(red, blue, 5, 3, 1, round);
        expect(winner).toBe(red);
        expect(method.type).toBe('points');
        expect(method.value).toBe('5');
    });

    it('returns tie when scores are equal and no declared_winner_id', () => {
        const round = endedRound();
        const { winner, method } = RDojoKombatRules.determineWinner(red, blue, 4, 4, 1, round);
        expect(winner).toBeNull();
        expect(method.type).toBe('tie');
        expect(method.value).toBe('4');
    });
});


// ===========================================================================
// determineWinner — edge cases
// ===========================================================================
describe('RDojoKombatRules.determineWinner — edge cases', () => {
    it('scores 20 as points in round 1 (threshold 24) but tech-fall in round 2 (threshold 16)', () => {
        const round = endedRound();

        const r1 = RDojoKombatRules.determineWinner(red, blue, 20, 0, 1, round);
        expect(r1.method.type).toBe('points');

        const r2 = RDojoKombatRules.determineWinner(red, blue, 20, 0, 2, round);
        expect(r2.method.type).toBe('tech-fall');
    });

    it('score exactly at round-1 threshold (24) is tech-fall, not points', () => {
        const round = endedRound();
        const { method } = RDojoKombatRules.determineWinner(red, blue, 24, 0, 1, round);
        expect(method.type).toBe('tech-fall');
        expect(method.value).toBe('24');
    });

    it('score one below round-1 threshold (23) is points, not tech-fall', () => {
        const round = endedRound();
        const { method } = RDojoKombatRules.determineWinner(red, blue, 23, 0, 1, round);
        expect(method.type).toBe('points');
    });

    it('declared winner takes priority over score — red wins via submission even when blue has a higher score', () => {
        const round = endedRound({ declared_winner_id: red.id, stoppage: false });
        const { winner, method } = RDojoKombatRules.determineWinner(red, blue, 0, 50, 1, round);
        expect(winner).toBe(red);
        expect(method.type).toBe('submission');
    });

    it('stoppage method.value is null (not set to score)', () => {
        const round = endedRound({ declared_winner_id: red.id, stoppage: true });
        const { method } = RDojoKombatRules.determineWinner(red, blue, 10, 0, 1, round);
        expect(method.type).toBe('stoppage');
        expect(method.value).toBeNull();
    });

    it('techFallThreshold is 8 for any round >= 3', () => {
        const round = endedRound();
        // A score of 8 should be tech-fall for rounds 3, 4, and beyond
        for (const roundNum of [3, 4, 5]) {
            const { method } = RDojoKombatRules.determineWinner(red, blue, 8, 0, roundNum, round);
            expect(method.type).toBe('tech-fall');
        }
    });
});


// ===========================================================================
// scoreRound
// ===========================================================================
describe('RDojoKombatRules.scoreRound', () => {
    const judges = [{ id: 'judge-1' }];

    // Helper: call scoreRound with a bound ended_at so open vote periods resolve
    // to a deterministic timestamp rather than "now"
    function scoreRound(votes, endedAt) {
        return RDojoKombatRules.scoreRound.call({ ended_at: endedAt }, red, blue, judges, votes);
    }

    // Helper: build a completed vote (has an ended_at)
    function vote(competitorId, startedAt, endedAt) {
        return { judge_id: 'judge-1', competitor_id: competitorId, started_at: startedAt, ended_at: endedAt };
    }

    it('floors each period by 3 — 8 seconds of control yields 2 points (not 2.67)', () => {
        const t0 = new Date('2026-01-01T10:00:00.000Z');
        const t1 = new Date('2026-01-01T10:00:08.000Z');
        const votes = [vote(red.id, t0, t1)];
        const { redScore, blueScore } = scoreRound(votes, t1);
        expect(redScore).toBe(2);   // floor(8/3) = 2
        expect(blueScore).toBe(0);
    });

    it('floors each period independently — two periods of 4s and 5s score 2, not 3', () => {
        // floor(4/3) + floor(5/3) = 1 + 1 = 2, vs floor(9/3) = 3 if merged
        const t0 = new Date('2026-01-01T10:00:00.000Z');
        const t1 = new Date('2026-01-01T10:00:30.000Z');
        const votes = [
            vote(red.id, t0,                                    new Date(t0.getTime() +  4000)),
            vote(red.id, new Date(t0.getTime() + 10000),        new Date(t0.getTime() + 15000)),
        ];
        const { redScore } = scoreRound(votes, t1);
        expect(redScore).toBe(2);
    });

    it('a control period under 3 seconds contributes zero points', () => {
        const t0 = new Date('2026-01-01T10:00:00.000Z');
        const t1 = new Date('2026-01-01T10:00:02.900Z');  // 2.9 s
        const votes = [vote(red.id, t0, t1)];
        const { redScore } = scoreRound(votes, t1);
        expect(redScore).toBe(0);
    });

    it('returns zero for both competitors when there are no votes', () => {
        const endedAt = new Date('2026-01-01T10:03:00.000Z');
        const { redScore, blueScore } = scoreRound([], endedAt);
        expect(redScore).toBe(0);
        expect(blueScore).toBe(0);
    });
});
