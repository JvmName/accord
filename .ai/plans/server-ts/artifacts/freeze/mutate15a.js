/**
 * Task 15a non-vacuity proofs: each mutation is applied to the CURRENT code
 * (src/), the named frozen/rewritten suites run, the file is restored and its
 * md5 checked against the original. A mutation must make at least one test
 * fail ("KILLED"). Usage (from server/):
 *
 *   bun ../.ai/plans/server-ts/artifacts/freeze/mutate15a.js [setPrefix ...]
 *
 * Writes nothing but stdout; results are pasted into mutation-results.md.
 */
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../../../server');
const md5 = (text) => crypto.createHash('md5').update(text).digest('hex');

const LC = ['test/services/lifecycleParity.test.js'];
const EM = ['test/workers/emissionDifferential.test.js'];
const WS = ['test/ws/webSocketTier.test.js'];
const RP = ['test/db/repositories/differential.test.js'];
const SER = ['test/serialize/goldenEquivalence.test.js', 'test/workers/emissionDifferential.test.js', 'test/contract/contract.test.js'];

const RL = 'src/services/roundLifecycle.ts';
const ML = 'src/services/matchLifecycle.ts';
const VS = 'src/services/ridingTimeVotes.ts';
const W  = (f) => `src/workers/${f}`;

// [id, description, file, from, to, tests]
const MUTATIONS = [
    // --- lifecycle M1..M12 (artifacts/lifecycle-inventory.md) -------------------------------------
    ['L-M1', 'finishRound: resume the pause BEFORE closing votes', RL,
        `    const ridingTimeVotes = await findOpenRoundVotes(db, round.id);
    for (const vote of ridingTimeVotes) {
        await endVote(db, vote);
    }

    if (await isRoundPaused(db, round.id)) await resumeRound(db, round);`,
        `    if (await isRoundPaused(db, round.id)) await resumeRound(db, round);

    const ridingTimeVotes = await findOpenRoundVotes(db, round.id);
    for (const vote of ridingTimeVotes) {
        await endVote(db, vote);
    }`, LC],
    ['L-M2', 'finishRound: drop the vote close', RL, `        await endVote(db, vote);`, `        void vote;`, LC],
    ['L-M3', 'endRound: remove the safe branch', ML, `        if (safe) return;\n`, ``, LC],
    ['L-M4', 'finishRound: early match end at 2 wins', RL, `    if (allRounds.length == rules.maxRounds) {`,
        `    if (allRounds.length == rules.maxRounds || (allRounds.length == 2 && allRounds[0].declared_winner_id == match.red_competitor_id)) {`, LC],
    ['L-M5', 'endMatch: do not clear the break fields', ML, `        break_started_at: null,
        break_duration:   null,
`, ``, LC],
    ['L-M6', 'endMatch: end the round BEFORE writing ended_at', ML, `    await updateMatch(db, match.id, {
        ended_at:         new Date(),
        break_started_at: null,
        break_duration:   null,
    });
    await endRound(db, match.id, { safe: true });`, `    await endRound(db, match.id, { safe: true });
    await updateMatch(db, match.id, {
        ended_at:         new Date(),
        break_started_at: null,
        break_duration:   null,
    });`, LC],
    ['L-M7', 'finishRound: set ended_at before resuming the pause', RL, `    if (await isRoundPaused(db, round.id)) await resumeRound(db, round);

    const match = await findMatchById(db, round.match_id);

    const endedAt = new Date();
    await updateRound(db, round.id, { ended_at: endedAt });`, `    const match = await findMatchById(db, round.match_id);

    const endedAt = new Date();
    await updateRound(db, round.id, { ended_at: endedAt });
    if (await isRoundPaused(db, round.id)) await resumeRound(db, round);`, LC],
    ['L-M8', 'setRoundResult: always write (drop the no-op skip)', RL, `    if (unchanged) return;\n`, ``, LC],
    ['L-M9', 'startMatch: skip copying the mat judges', ML, `    await setMatchJudges(db, match.id, judges.map((judge) => judge.id));`, `    void judges; void setMatchJudges;`, LC],
    ['L-M10', 'pauseRound: drop the already-paused check', RL, `    if (await isRoundPaused(db, round.id)) throw new Error('Round is already paused');\n`, ``, LC],
    ['L-M11', 'endRidingTime: honour the rider colour (a "fix")', VS, `    const activeVote = await findOpenVoteForJudge(db, round.id, judgeId);
    if (!activeVote) throw new Error(\`Riding time is not active\`);`, `    const match = await findMatchById(db, (round as any).match_id);
    const competitor = await competitorForColor(db, match, riderColor);
    const all = await findOpenVoteForJudge(db, round.id, judgeId);
    const activeVote = all && all.competitor_id === competitor?.id ? all : undefined;
    if (!activeVote) throw new Error(\`Riding time is not active\`);`, LC],
    ['L-M12', 'finishRound: break duration index off by one', RL, `rules.getBreakDuration(allRounds.length)`, `rules.getBreakDuration(allRounds.length + 1)`, LC],

    // --- workers M1..M17 (artifacts/workers-notes.md) ---------------------------------------------
    ['E-M1', 'MU: drop the final-broadcast branch', W('matchUpdateWorker.ts'), 'if (justEndedIds.length) {', 'if (false && justEndedIds.length) {', EM],
    ['E-M2', 'MU: throttle 1000 -> 750 ms', W('matchUpdateWorker.ts'), 'BROADCAST_INTERVAL_MS = 1000', 'BROADCAST_INTERVAL_MS = 750', EM],
    ['E-M3', 'MU: throttle >= -> >', W('matchUpdateWorker.ts'), 'this.#lastBroadcastTime >= BROADCAST_INTERVAL_MS', 'this.#lastBroadcastTime > BROADCAST_INTERVAL_MS', EM],
    ['E-M4', 'TF: wrong event name', W('techFallTrackerWorker.ts'), 'EVENTS.TECH_FALL, serializeLeakedMatch', 'EVENTS.MATCH_UPDATE, serializeLeakedMatch', EM],
    ['E-M5', 'TF: payload also includes mat', W('techFallTrackerWorker.ts'), 'serializeLeakedMatch(ended, { includeRounds: true })', 'serializeLeakedMatch(ended, { includeRounds: true, includeMat: true })', EM],
    ['E-M6', 'TF: emit before ending the round', W('techFallTrackerWorker.ts'),
        "        await endRound(this.db, graph.id);\n\n        // Rounds only: no mat and no judges in this payload.\n        const ended = await findMatchGraph(this.db, graph.id);\n        this.notifyServer(EVENTS.TECH_FALL, serializeLeakedMatch(ended, { includeRounds: true }));",
        "        const ended = await findMatchGraph(this.db, graph.id);\n        this.notifyServer(EVENTS.TECH_FALL, serializeLeakedMatch(ended, { includeRounds: true }));\n        await endRound(this.db, graph.id);", EM],
    ['E-M7', 'BT: start the round before clearing the break', W('breakTransitionWorker.ts'),
        "        await updateMatch(this.db, match.id, { break_started_at: null, break_duration: null });\n        await startRound(this.db, match.id);",
        "        await startRound(this.db, match.id);\n        await updateMatch(this.db, match.id, { break_started_at: null, break_duration: null });", EM],
    ['E-M8', 'MU: never remember the active set', W('matchUpdateWorker.ts'), '        this.#previousMatchIds = currentMatchIds;\n', '', EM],
    ['E-M9', 'RT: ignore pauses', W('roundTimerWorker.ts'), 'roundTimeRemaining(loaded,', 'roundTimeRemaining({ ...loaded, pauses: [] },', EM],
    ['E-M10', 'TF: check red only', W('techFallTrackerWorker.ts'), '    if (blueScore >= threshold) return true;\n', '', EM],
    ['E-M11', 'BT: boundary < -> <=', W('breakTransitionWorker.ts'), 'if (elapsed < match.break_duration) return;', 'if (elapsed <= match.break_duration) return;', EM],
    ['E-M12', 'MU: no broadcasts for matches in a break', W('matchUpdateWorker.ts'), '            for (const match of breakMatches) this.#broadcast(graphs.get(match.id));\n', '', EM],
    ['E-M13', 'RT: payload with all includes', W('roundTimerWorker.ts'), 'serializeLeakedMatch(ended, { includeRounds: true })', 'serializeLeakedMatch(ended, { includeRounds: true, includeMat: true, includeMatchJudges: true })', EM],
    ['E-M14', 'MU: safe serializer instead of the leaked one', W('matchUpdateWorker.ts'), 'import { serializeLeakedMatch, type MatchRenderOptions }', 'import { serializeMatch as serializeLeakedMatch, type MatchRenderOptions }', EM],
    ['E-M15', 'BT: render before the new round exists', W('breakTransitionWorker.ts'),
        "        await startRound(this.db, match.id);\n\n        const fresh = await findMatchGraph(this.db, match.id);",
        "        const fresh = await findMatchGraph(this.db, match.id);\n        await startRound(this.db, match.id);\n", EM],
    ['E-M16', 'TF: endRound with safe: true (equivalent without a race)', W('techFallTrackerWorker.ts'), 'await endRound(this.db, graph.id);', 'await endRound(this.db, graph.id, { safe: true });', EM],
    ['E-M17', 'MU: first tick not broadcast', W('matchUpdateWorker.ts'), '#lastBroadcastTime = 0;', '#lastBroadcastTime = Date.now();', EM],

    // --- WebSocket tier W1..W10 (artifacts/workers-notes.md section 6) ------------------------------
    ['W1', 'reject a socket whose token matches no user', 'src/ws/webSocket.ts', "            this.close();\n            return;", "            throw new Error('unknown user');", WS],
    ['W2', 'refuse array tokens', 'src/ws/webSocket.ts', "    if (Array.isArray(token)) {", "    if (Array.isArray(token)) {\n        throw new Error('Invalid value');", WS],
    ['W3', 'null-safe join log (no crash)', 'src/ws/webSocket.ts', 'user=${this.currentUser.id} match', 'user=${this.currentUser?.id} match', WS],
    ['W4', 'different room name', 'src/ws/abstractWebSocket.ts', 'return `match:${matchId}`;', 'return `match-${matchId}`;', WS],
    ['W5', 'drop the room.join handler', 'src/ws/abstractWebSocket.ts', "        this.on('room.join',  (room: string) => { this.join(room)  });\n", '', WS],
    ['W6', 'relay tech-fall as match.update', 'src/ws/workerWebSocket.ts', 'this.emitToRoom(room, EVENTS.TECH_FALL, match);', 'this.emitToRoom(room, EVENTS.MATCH_UPDATE, match);', WS],
    ['W7', 'require a user to view a match (a join authorization check)', 'src/ws/webSocket.ts', 'const allowed = await can(', 'const allowed = !!this.currentUser && await can(', WS],
    ['W8', 'match ids: numbers throw too', 'src/ws/webSocket.ts', "if (typeof matchId !== 'string' && typeof matchId !== 'number') {", "if (typeof matchId !== 'string') {", WS],
    ['W9', 'worker branch first', 'src/ws/webSocketServer.ts', "        if (auth?.apiToken) {\n            socket = new WebSocket(ioSocket, this);\n        } else if (query?.workerToken) {\n            socket = new WorkerWebSocket(ioSocket, this);", "        if (query?.workerToken) {\n            socket = new WorkerWebSocket(ioSocket, this);\n        } else if (auth?.apiToken) {\n            socket = new WebSocket(ioSocket, this);", WS],
    ['W10', 'multiple tokens: largest wins', 'src/db/repositories/users.ts', 'orderBy: [asc(users.api_token)],', 'orderBy: [sql`${users.api_token} DESC`],', WS],

    // --- repositories (representative) ------------------------------------------------------------
    ['R1', 'findLastRound returns the FIRST round', 'src/db/repositories/rounds.ts', 'orderBy: [desc(rounds.created_at), desc(rowid)],', 'orderBy: [asc(rounds.created_at), asc(rowid)],', RP],
    ['R2', 'mat graph codes in reverse role order', 'src/db/repositories/mats.ts', 'matCodes:   { orderBy: (t, o) => [o.asc(t.role)] },', 'matCodes:   { orderBy: (t, o) => [o.desc(t.role)] },', RP],
    ['R3', 'findMatByCode: unknown code -> null instead of undefined', 'src/db/repositories/mats.ts', '    if (!matCode) return undefined;', '    if (!matCode) return null;', RP],
    ['R4', 'findMatViewers ignores the user filter', 'src/db/repositories/mats.ts', "    const where = filter.userId === undefined\n", "    const where = true\n", RP],
    ['R5', 'findMatJudges by join time instead of user id', 'src/db/repositories/mats.ts', '        .orderBy(asc(judges_mats.user_id));', '        .orderBy(sql`${judges_mats.user_id} DESC`);', RP],

    // --- serializers (artifacts/serialize-inventory.md, representative) -----------------------------
    ['S1', 'emit red_score on Match', 'src/serialize/match.ts', '        break_remaining:  matchBreakRemaining(match, now),', '        break_remaining:  matchBreakRemaining(match, now),\n        red_score:        match.red_score,', SER],
    ['S3', 'break_remaining always null', 'src/serialize/match.ts', '        break_remaining:  matchBreakRemaining(match, now),', '        break_remaining:  null,', SER],
    ['S5', 'winner always null', 'src/serialize/match.ts', '        winner:           renderNullableUser(matchWinner(match, now)),', '        winner:           null,', SER],
    ['S6', 'time_remaining ignores pauses', 'src/serialize/round.ts', '        time_remaining: roundTimeRemaining(round, maxDuration, now),', '        time_remaining: roundTimeRemaining({ ...round, pauses: [] }, maxDuration, now),', SER],
    ['S7', 'rounds reversed', 'src/serialize/match.ts', '        response.rounds = match.rounds.map(', '        response.rounds = [...match.rounds].reverse().map(', SER],
    ['S8', 'drop the legacy `|| null`', 'src/serialize/values.ts', '    return value || null;', '    return value ?? null;', ['test/serialize/match.test.js', 'test/serialize/mat.test.js', 'test/serialize/index.test.js', ...SER]],

    // --- permissions / error rendering / route table ------------------------------------------------
    ['P1', 'mat assign: drop the "code of THIS mat" check', 'src/http/permissions.ts', '            if (subject.matCode.mat_id != scope.id) return false;\n', '', ['test/http/permissions.test.ts']],
    ['P2', 'mat view requires a user (one level flipped)', 'src/http/permissions.ts', "        case 'be assigned judge':\n            return true;\n        case 'view':\n            return true;", "        case 'be assigned judge':\n            return true;\n        case 'view':\n            return !!subject.user;", ['test/http/permissions.test.ts']],
    ['P3', 'pause widened: no manage check first', 'src/http/permissions.ts', "            return await matchPermission(subject, 'manage', scope, loaders) || await matchPermission(subject, 'judge', scope, loaders);", "            return await matchPermission(subject, 'judge', scope, loaders);", ['test/http/permissions.test.ts']],
    ['X1', 'error identity check -> instanceof (AuthorizationError)', 'src/http/middleware/errors.ts', '(err as object).constructor === AuthorizationError', 'err instanceof AuthorizationError', ['test/http/envelope.test.ts', 'test/characterization/errorMapping.test.js']],
    ['X2', 'driver message under "null" as an array', 'src/http/errors.ts', "        if (legacy.parent) errors['null'] = legacy.parent.message;", "        if (legacy.parent) errors['null'] = [legacy.parent.message];", ['test/http/envelope.test.ts', 'test/characterization/errorMapping.test.js']],
    ['X3', 'ValidationError renders 500', 'src/http/middleware/errors.ts', '        sendRendered(res, renderErrors((err as ValidationError).errors));', "        sendEnvelope(res, 500, { error: 'x' });", ['test/http/envelope.test.ts', 'test/characterization/errorMapping.test.js']],

    // --- rewritten characterization tests (protected-changes.md) -----------------------------------
    ['C1', 'matCode: a code-shaped :matId is looked up as a mat id', 'src/http/middleware/requestState.ts', '            code = input.matId;', '            mat = await findMatById(db, input.matId as string);', ['test/characterization/matCode.test.js']],
    ['C2', 'matCode: anchored regexp (a "fix")', 'src/domain/matCode.ts', 'const CODE_REGEXP = /\\w+\\.\\w+\\.\\w+/;', 'const CODE_REGEXP = /^\\w+\\.\\w+\\.\\w+$/;', ['test/characterization/matCode.test.js']],
    ['C3', 'matCode: explicit matCode param ignored', 'src/http/middleware/requestState.ts', '    let code = input.matCode;', '    let code: unknown = undefined;', ['test/characterization/matCode.test.js']],
    ['C4', 'techFall: endRound with safe: true', W('techFallTrackerWorker.ts'), 'await endRound(this.db, graph.id);', 'await endRound(this.db, graph.id, { safe: true });', ['test/characterization/workers/techFallTracker.test.js']],
    ['C5', 'techFall: threshold needs more than the score (>= -> >)', W('techFallTrackerWorker.ts'), '    return redScore >= threshold;', '    return redScore > threshold;', ['test/characterization/workers/techFallTracker.test.js']],
    ['C6', 'techFall: emit before ending the round', W('techFallTrackerWorker.ts'),
        "        await endRound(this.db, graph.id);\n\n        // Rounds only: no mat and no judges in this payload.\n        const ended = await findMatchGraph(this.db, graph.id);\n        this.notifyServer(EVENTS.TECH_FALL, serializeLeakedMatch(ended, { includeRounds: true }));",
        "        const ended = await findMatchGraph(this.db, graph.id);\n        this.notifyServer(EVENTS.TECH_FALL, serializeLeakedMatch(ended, { includeRounds: true }));\n        await endRound(this.db, graph.id);", ['test/characterization/workers/techFallTracker.test.js']],
    ['C7', 'techFall: payload includes the mat', W('techFallTrackerWorker.ts'), 'serializeLeakedMatch(ended, { includeRounds: true })', 'serializeLeakedMatch(ended, { includeRounds: true, includeMat: true })', ['test/characterization/workers/techFallTracker.test.js']],
    ['C8', 'breakTransition: boundary < -> <=', W('breakTransitionWorker.ts'), 'if (elapsed < match.break_duration) return;', 'if (elapsed <= match.break_duration) return;', ['test/characterization/workers/breakTransition.test.js']],
    ['C9', 'breakTransition: start the round before clearing the break', W('breakTransitionWorker.ts'),
        "        await updateMatch(this.db, match.id, { break_started_at: null, break_duration: null });\n        await startRound(this.db, match.id);",
        "        await startRound(this.db, match.id);\n        await updateMatch(this.db, match.id, { break_started_at: null, break_duration: null });", ['test/characterization/workers/breakTransition.test.js']],
    ['C10', 'breakTransition: ended matches no longer excluded (4th round)', 'src/db/repositories/matches.ts', 'where:   and(isNotNull(matches.break_started_at), isNull(matches.ended_at)),', 'where:   isNotNull(matches.break_started_at),', ['test/characterization/workers/breakTransition.test.js']],
    ['C11', 'breakTransition: render before the new round exists', W('breakTransitionWorker.ts'),
        "        await startRound(this.db, match.id);\n\n        const fresh = await findMatchGraph(this.db, match.id);",
        "        const fresh = await findMatchGraph(this.db, match.id);\n        await startRound(this.db, match.id);\n", ['test/characterization/workers/breakTransition.test.js']],
    ['C12', 'roundTimer: ignore pauses', W('roundTimerWorker.ts'), 'roundTimeRemaining(loaded,', 'roundTimeRemaining({ ...loaded, pauses: [] },', ['test/characterization/workers/roundTimer.test.js']],
    ['C13', 'roundTimer: endRound with safe: true', W('roundTimerWorker.ts'), 'await endRound(this.db, graph.id);', 'await endRound(this.db, graph.id, { safe: true });', ['test/characterization/workers/roundTimer.test.js']],
    ['C14', 'roundTimer: fire one second early', W('roundTimerWorker.ts'), '        if (timeRemaining !== 0) return;', '        if (timeRemaining > 1) return;', ['test/characterization/workers/roundTimer.test.js']],
    ['C15', 'roundTimer: payload with all includes', W('roundTimerWorker.ts'), 'serializeLeakedMatch(ended, { includeRounds: true })', 'serializeLeakedMatch(ended, { includeRounds: true, includeMat: true, includeMatchJudges: true })', ['test/characterization/workers/roundTimer.test.js']],
    ['C16', 'roundTimer: wrong event', W('roundTimerWorker.ts'), 'this.notifyServer(EVENTS.MATCH_UPDATE,', 'this.notifyServer(EVENTS.TECH_FALL,', ['test/characterization/workers/roundTimer.test.js']],

    // --- datetime codec and seed (added in session 2) -----------------------------------------------
    ['DT1', 'isoDateTime writes without milliseconds', 'src/db/columns.ts', '        return value.toISOString();', "        return value.toISOString().replace(/\\.\\d{3}Z$/, 'Z');", ['test/db/datetime.test.js']],
    ['DT2', 'isoDateTime reads the raw string (no Date)', 'src/db/columns.ts', '        return new Date(value);', '        return value as unknown as Date;', ['test/db/datetime.test.js']],
    ['SD1', 'seed: consensus votes start one second late', 'test/contract/seed.ts', '    clock.set(from);\n    for (const judgeId of judges) {', '    clock.set(from + 1000);\n    for (const judgeId of judges) {', ['test/services/lifecycleParity.test.js']],
    ['SD2', 'insertUser ignores an explicit id (seed ids change)', 'src/db/repositories/users.ts', '        ...(values.id ? { id: values.id } : {}),\n        name:      values.name,', '        name:      values.name,', ['test/services/lifecycleParity.test.js']],

    // --- routing flip (artifacts/routing-flip-notes.md, route-registry-notes.md B) -------------------
    ['RF1', 'server loads a controller from controllers/', 'src/http/server.ts', "import { randomUUID } from 'crypto';", "import { randomUUID } from 'crypto';\nrequire('../../controllers/usersController');", ['test/characterization/routeTable.test.js']],
    ['RF2', 'register the user routes twice', 'src/http/routes/index.ts', '    ...userRoutes,\n', '    ...userRoutes,\n    ...userRoutes,\n', ['test/characterization/routeTable.test.js', 'test/http/routeTable.test.ts', 'test/http/liveRoutes.test.ts']],
    ['RF3', 'POST /match/:matchId/start declared match/view', 'src/http/routes/matches.ts', "    path:      '/match/:matchId/start',\n    authorize: { scope: 'match', level: 'manage' },", "    path:      '/match/:matchId/start',\n    authorize: { scope: 'match', level: 'view' },", ['test/http/routeTable.test.ts', 'test/characterization/authorization.test.js']],
];

const only = process.argv.slice(2);
const results = [];
for (const [id, desc, rel, from, to, tests] of MUTATIONS) {
    if (only.length && !only.some((p) => id.startsWith(p))) continue;
    const file = path.join(ROOT, rel);
    const original = fs.readFileSync(file, 'utf8');
    const before = md5(original);
    const count = original.split(from).length - 1;
    if (count !== 1) { console.log(`| ${id} | ${desc} | PATTERN FOUND ${count}x, NOT RUN | |`); continue; }
    let line;
    try {
        let mutated = original.replace(from, to);
        if (to.includes('sql`') && !/import \{[^}]*\bsql\b/.test(mutated)) mutated = `import { sql } from 'drizzle-orm';\n${mutated}`;
        fs.writeFileSync(file, mutated);
        const run = spawnSync('timeout', ['300', 'bun', 'test', '--isolate', ...tests], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, LOG_LEVEL: 'warn' } });
        const out = (run.stdout || '') + (run.stderr || '');
        const pass = (out.match(/^\s*(\d+) pass/m) || [])[1] ?? '?';
        const fail = (out.match(/^\s*(\d+) fail/m) || [])[1] ?? '?';
        const failing = [...out.matchAll(/^\(fail\) (.*?)(?: \[[\d.]+ms\])?$/gm)].map((m) => m[1]);
        const killed = Number(fail) > 0 || /error:|SyntaxError|TypeError: .*is not/i.test(out) && Number(pass) === 0;
        line = `| ${id} | ${desc} | ${killed ? 'KILLED' : 'SURVIVED'} | ${fail} fail / ${pass} pass: ${failing.slice(0, 3).map((f) => f.slice(0, 90)).join('; ')}${failing.length > 3 ? `; +${failing.length - 3} more` : ''} |`;
    } finally {
        fs.writeFileSync(file, original);
    }
    const after = md5(fs.readFileSync(file, 'utf8'));
    if (after !== before) throw new Error(`${rel} NOT RESTORED`);
    results.push(line);
    console.log(line);
}
const status = spawnSync('git', ['status', '--short', 'src'], { cwd: ROOT, encoding: 'utf8' }).stdout;
console.log(`\nsrc/ after all mutations (git status --short src): ${status.trim() === '' ? 'clean' : status}`);
console.log(`test/contract/seed.ts md5 after: ${md5(fs.readFileSync(path.join(ROOT, 'test/contract/seed.ts'), 'utf8'))}`);
