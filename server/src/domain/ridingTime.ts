/**
 * Consensus riding-time calculator — the application's core algorithm.
 *
 * Moved from `lib/ridingTime.js` in server-ts task 08; the algorithm is
 * unchanged. Threshold is 1 for a single judge and ALWAYS 2 for any
 * multi-judge panel. Time derives from vote timestamps, never increments.
 *
 * Pure: no imports outside `src/domain`.
 */
import type { Judge, PauseInput, RidingTimeModule, RidingTimeVoteInput } from './types';

type EventType = 'voteStart' | 'voteEnd' | 'pausedAt' | 'resumedAt';
interface CalcEvent {
    time: Date;
    type: EventType;
    vote?: RidingTimeVoteInput;
}

// `Date - Date` is valid JS (both operands go through valueOf) but not valid
// TS, so the subtractions below cast `as unknown as number`. The casts are
// type-only; the emitted subtraction is byte-for-byte the original.


class RidingTimeCalculator {
    #activeVotes: Record<string, RidingTimeVoteInput> = {};
    #controlStartedAt: Date | null | undefined;
    #endAt: Date;
    #controlPeriods: number[] = [];
    #votes: RidingTimeVoteInput[];
    #voteThreshold: number;
    #events: CalcEvent[] = [];
    #pendingControlTime = 0;
    #paused = false;
    #pauses: readonly PauseInput[];
    #resumedAt: Date | null = null;

    constructor(votes: RidingTimeVoteInput[], judges: readonly Judge[], endAt?: Date | null, pauses: readonly PauseInput[] = []) {
        this.#endAt  = endAt || new Date();
        this.#votes  = votes;
        // NOTE: sorts the caller's array IN PLACE. Preserved behaviour.
        this.#votes.sort((v1,v2) => (v1.started_at as unknown as number) - (v2.started_at as unknown as number));
        this.#pauses = pauses;

        this.#voteThreshold = judges.length === 1 ? 1 : 2;
    }


    calculate() {
        this.#collectEvents();
        this.#sortEvents();
        this.#processEvents();
    }


    #collectEvents() {
        this.#events = [];

        for (const vote of this.#votes) {
            this.#events.push({ time: new Date(vote.started_at), type: 'voteStart', vote });
            if (vote.ended_at) {
                this.#events.push({ time: new Date(vote.ended_at), type: 'voteEnd', vote });
            }
        }

        for (const pause of this.#pauses) {
            if (pause.paused_at) {
                this.#events.push({ time: new Date(pause.paused_at), type: 'pausedAt' });
            }
            if (pause.resumed_at) {
                this.#events.push({ time: new Date(pause.resumed_at), type: 'resumedAt' });
            }
        }
    }


    #sortEvents() {
        // Sort chronologically; for ties, process pause events before vote events
        this.#events.sort((a, b) => {
            const diff = (a.time as unknown as number) - (b.time as unknown as number);
            if (diff !== 0) return diff;
            const order = { pausedAt: 0, resumedAt: 0, voteStart: 1, voteEnd: 1 };
            return (order[a.type] || 0) - (order[b.type] || 0);
        });
    }


    #processEvents() {
        for (const event of this.#events) {
            if (event.type === 'voteStart') {
                this.#startVote(event.vote);
            } else if (event.type === 'voteEnd') {
                this.#endVote(event.vote);
            } else if (event.type === 'pausedAt') {
                this.#handlePause(event.time);
            } else if (event.type === 'resumedAt') {
                this.#handleResume(event.time);
            }
        }

        if (this.controlActive && !this.#paused) {
            this.#endControlPeriod(this.#endAt);
        } else if (this.#paused && this.#pendingControlTime > 0) {
            this.#controlPeriods.push(this.#pendingControlTime / 1000);
        }
    }


    #handlePause(pausedAt: Date) {
        if (this.#controlStartedAt !== null && this.#controlStartedAt !== undefined) {
            // Suspend the in-progress control period without discarding it
            this.#pendingControlTime = pausedAt.getTime() - this.#controlStartedAt.getTime();
            this.#controlStartedAt = null;
        }
        this.#paused = true;
    }


    #handleResume(resumedAt: Date) {
        this.#paused = false;
        this.#resumedAt = resumedAt;
        if (this.controlActive) {
            // Quorum already met on resume: immediately apply pending time
            this.#controlStartedAt = new Date(resumedAt.getTime() - this.#pendingControlTime);
            this.#pendingControlTime = 0;
            this.#resumedAt = null;
        }
    }


    #startVote(vote: RidingTimeVoteInput) {
        this.#activeVotes[vote.judge_id] = vote;
        if (!this.#paused && !this.#controlStartedAt && this.controlActive) {
            const voteTime = new Date(vote.started_at).getTime();
            const withinGrace = this.#resumedAt !== null && (voteTime - this.#resumedAt.getTime()) <= 1500;
            this.#controlStartedAt = new Date(withinGrace ? voteTime - this.#pendingControlTime : voteTime);
            this.#pendingControlTime = 0;
            this.#resumedAt = null;
        }
    }


    #endVote(vote: RidingTimeVoteInput) {
        delete this.#activeVotes[vote.judge_id];
        if (!this.controlActive && !this.#paused && this.#controlStartedAt) {
            this.#endControlPeriod(vote.ended_at);
            this.#controlStartedAt = null;
            this.#pendingControlTime = 0;
            this.#resumedAt = null;
        } else if (!this.controlActive && this.#paused && this.#pendingControlTime > 0) {
            // Quorum lost during pause — score the banked pre-pause time as a completed period
            this.#controlPeriods.push(this.#pendingControlTime / 1000);
            this.#pendingControlTime = 0;
        }
    }


    get controlPeriods() { return this.#controlPeriods; }
    get controlActive() { return this.numVotes >= this.#voteThreshold }
    get numVotes()      { return Object.values(this.#activeVotes).length }
    // Unused (no caller anywhere). `Math.MIN_VALUE` does not exist (it is
    // `Number.MIN_VALUE`), so an open vote sorts as NaN. Dead code, preserved
    // as-is — see FINDINGS.md F-35.
    get activeVotes()   {
        const activeVotes = Object.values(this.#activeVotes);
        activeVotes.sort((vote1,vote2) => {
            // @ts-expect-error -- Math.MIN_VALUE is undefined at runtime (F-35)
            const val1 = vote1.ended_at || Math.MIN_VALUE;
            // @ts-expect-error -- Math.MIN_VALUE is undefined at runtime (F-35)
            const val2 = vote2.ended_at || Math.MIN_VALUE;
            return (val1 as unknown as number) - (val2 as unknown as number);
        });
        return activeVotes
    }


    #endControlPeriod(endAt: Date) {
        const ms = endAt.getTime() - this.#controlStartedAt.getTime();
        this.#controlPeriods.push(ms / 1000);
        this.#controlStartedAt = null;
    }
}


function calculateRidingTime(votes: RidingTimeVoteInput[], judges: readonly Judge[], endAt?: Date | null, pauses: readonly PauseInput[] = []): number[] {
    const calculator = new RidingTimeCalculator(votes, judges, endAt, pauses);
    calculator.calculate();
    return calculator.controlPeriods;
}


const ridingTime: RidingTimeModule = {
    calculateRidingTime
};

module.exports = ridingTime;
