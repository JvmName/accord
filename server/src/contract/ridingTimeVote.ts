/**
 * Riding-time votes.
 *
 * **`RidingTimeVote` has no wire representation.** It is a first-class entity
 * in the database (`round_id`, `judge_id`, `competitor_id`, `ended_at`) and
 * the input to the consensus algorithm in `lib/ridingTime.js`, but it is
 * never serialised: `models.kt` declares no `RidingTimeVote` class, and both
 * vote endpoints render the enclosing **Match** instead —
 *
 *   `POST   /match/:matchId/ridingTime`  → `{ match }`
 *   `DELETE /match/:matchId/ridingTime`  → `{ match }`
 *
 * — with the votes visible only through their effect on `Round.score`.
 * Confirmed across `http.ridingTime.*` in `test/contract/goldens/`.
 *
 * This module exists so that absence is stated rather than looked like an
 * omission. The vote's row type arrives with Drizzle in task 09; if a future
 * endpoint ever exposes a vote directly, its wire schema belongs here.
 */
import { matchResponseSchema } from './responses';

/**
 * Both riding-time endpoints return the full match payload. The request body
 * for starting a vote is `startRidingTimeVoteRequestSchema` in `requests.ts`.
 */
export const ridingTimeResponseSchema = matchResponseSchema;
