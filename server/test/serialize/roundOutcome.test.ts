import { describe, expect, it } from 'bun:test';
import { roundOutcome } from '../../src/serialize';

const T = (seconds: number) => new Date(Date.UTC(2026, 0, 1, 10, 0, seconds));

const red   = { id: 'red',   name: 'Red' };
const blue  = { id: 'blue',  name: 'Blue' };
const judge = { id: 'judge' };

function match(round: object) {
    return { red_competitor_id: red.id, blue_competitor_id: blue.id, redCompetitor: red, blueCompetitor: blue, judges: [judge], rounds: [round as { id: string }] } as any;
}

function round(endedAt: Date | null) {
    const openVote = { id: 'v', round_id: 'r', judge_id: judge.id, competitor_id: red.id, created_at: T(0), ended_at: null };
    return { id: 'r', created_at: T(0), ended_at: endedAt, declared_winner_id: null, stoppage: null, ridingTimeVotes: [openVote], pauses: [] } as any;
}

describe('roundOutcome', () => {
    it('scores an open round up to now', () => {
        const open = round(null);
        expect(roundOutcome(match(open), open, T(12)).redScore).toBe(4);
    });

    it('stops an ended round with a vote still open at its ended_at, however late it is read', () => {
        const ended = round(T(9));
        expect(roundOutcome(match(ended), ended, T(12)).redScore).toBe(3);
        expect(roundOutcome(match(ended), ended, T(600)).redScore).toBe(3);
    });
});
