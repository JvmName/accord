/**
 * The wire contract, as Zod schemas.
 *
 * This layer is **the API's wire types, not the database schema** — the two
 * genuinely differ (`Round.score`, `Round.result`, `Round.paused`,
 * `time_remaining`, `Match.red_competitor`, `Match.break_remaining`,
 * `Mat.current_match` and `upcoming_matches` are all computed, not columns).
 *
 * Every schema here is derived from the task-04 goldens in
 * `test/contract/goldens/`, cross-checked field by field against the Kotlin
 * client's `models.kt`. Where a golden and a prose document disagreed, the
 * golden won; those cases are commented in place and recorded in
 * `.ai/plans/server-ts/FINDINGS.md` (F-20, F-21, F-22, F-24).
 *
 * `test/contract/schemas.test.ts` parses all 85 goldens through these
 * schemas, so they describe reality rather than aspiration.
 */
export * from './scalars';
export * from './envelope';
export * from './user';
export * from './matCode';
export * from './mat';
export * from './match';
export * from './round';
export * from './ridingTimeVote';
export * from './requests';
export * from './responses';
export * from './websocket';
