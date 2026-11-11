const { afterAll, beforeAll, describe, expect, it } = require('bun:test');
/**
 * The worker jobs (src/workers) against the `emissions` snapshot fixture: for
 * every timeline in ./emissionScenarios.js, the emissions per room, the
 * payloads, the outcome of every action and rejected job, and the writes and
 * row changes after every step must equal the recorded ones exactly (see
 * test/fixtures/frozen/README.md). Every payload is also checked against its
 * event schema.
 */
const H = require('../services/support');
const E = require('./emissionScenarios');
const F = require('../support/frozen');
const { assertSocketPayload } = require('../../src/workers/worker');

/**
 * Statements per job the pre-migration implementation ran for the "all at
 * once" scenario. The current jobs load one graph per tick and must never
 * need more.
 */
const PRE_MIGRATION_STATEMENTS = { techFall: 412, breakTransition: 28, roundTimer: 197, matchUpdate: 862 };

let db;
let snap;
let fixture;
const results = new Map();
const statements = [];

beforeAll(() => {
    db = H.modernDb();
    E.insertBase(db.$client);
    snap = H.snapshot(db.$client);
    fixture = F.readFixture('emissions');
});

afterAll(() => {
    if (db) db.$client.close();
});

/** Counts the SQL statements each job prepares per run (the clock is frozen at the step's instant). */
function countStatements(workers, scenario) {
    const client = db.$client;
    for (const [job, worker] of Object.entries(workers)) {
        const perform = worker.performJob.bind(worker);
        worker.performJob = async () => {
            const prepare = client.prepare;
            let n = 0;
            client.prepare = function (...args) { n++; return prepare.apply(this, args); };
            try { return await perform(); } finally {
                client.prepare = prepare;
                statements.push({ scenario: scenario.name, at: Date.now() - E.T0, job, n });
            }
        };
    }
}

async function run(scenario) {
    const known = E.loadScenario(db.$client, snap, scenario);
    const workers = E.modernWorkers(db);
    countStatements(workers, scenario);
    const timeline = await E.runTimeline({
        client: db.$client,
        workers,
        actions: E.modernActions(db),
        onPayload: (event, payload) => assertSocketPayload(event, payload),
    }, scenario);
    return E.encodeTimeline(scenario.name, timeline, known);
}

describe('emissions snapshot: src/workers emit exactly the recorded events', () => {
    it('the fixture holds exactly the scenarios defined, with a summary for each', () => {
        const summaries = [...fixture.records.keys()].filter((k) => !k.includes(' | ')).sort();
        expect(summaries).toEqual(E.SCENARIOS.map((s) => s.name).sort());
        expect(summaries.length).toBe(11);
        for (const name of summaries) {
            const summary = fixture.records.get(name);
            for (const room of summary.rooms) expect(fixture.records.get(`${name} | ${room}`).emissions.length).toBeGreaterThan(0);
            for (let p = 0; p < summary.payloads; p++) expect(fixture.records.get(`${name} | payload ${p}`)).toBeDefined();
            for (const step of summary.steps) expect(fixture.records.has(step)).toBe(true);
        }
    });

    for (const scenario of E.SCENARIOS) {
        it(scenario.name, async () => {
            const records = await run(scenario);
            results.set(scenario.name, records);
            const expected = [...fixture.records.values()].filter((r) => r.key === scenario.name || r.key.startsWith(`${scenario.name} | `));
            expect(records.map((r) => r.key)).toEqual(expected.map((r) => r.key));
            for (let i = 0; i < records.length; i++) expect(F.asStored(records[i])).toEqual(expected[i]);

            const summary = records[0];
            const emitted = E.emittedFrom(records);
            expect(summary.rejections.length + summary.actions.filter(([, o]) => !o.ok).length).toBe(scenario.expect?.rejections ?? 0);
            if (scenario.expect?.emissions !== undefined) expect(emitted).toHaveLength(scenario.expect.emissions);
            for (const [event, n] of Object.entries(scenario.expect?.events || {})) {
                expect(emitted.filter((e) => e.event === event)).toHaveLength(n);
            }
        }, 60000);
    }

    // What the scenarios above are about, so a scenario that silently stopped
    // exercising its subject fails here.
    it('the scenarios exercise what they claim', () => {
        const at   = (name) => E.emittedFrom(results.get(name));
        const secs = (name, list) => list.map((e) => E.SCENARIOS.find((s) => s.name === name).steps[e.step].at);

        // ~1 s cadence on a 250 ms tick; regular updates carry the mat, the judges and the rounds.
        const cadence = 'round in progress: match.update about once a second on a 250 ms tick';
        expect(secs(cadence, at(cadence))).toEqual([0, 1000, 2000, 3000]);
        for (const e of at(cadence)) expect(Object.keys(e.payload)).toEqual(expect.arrayContaining(['mat', 'judges', 'rounds']));

        // The final update is not throttled: with the match-update job first, the two matches the
        // other jobs end in the 2 s tick get their final update at 2.25 s, inside the 1 s throttle
        // window, and nothing else is broadcast then.
        const first = 'all at once, with the match-update job running FIRST on whole seconds';
        const at2250 = at(first).filter((e) => secs(first, [e])[0] === 2250);
        expect(at2250.map((e) => e.room).sort()).toEqual([`match:${E.M.tf3}`, `match:${E.M.timer3}`].sort());
        expect(at2250.every((e) => e.job === 'matchUpdate' && e.payload.ended_at !== null)).toBe(true);

        // break_remaining counts down, then break.ended carries the new round and no break.
        const brk = at('a break counting down, then expiring and starting the next round');
        expect(brk.filter((e) => e.event === 'match.update' && e.payload.break_remaining !== null).map((e) => e.payload.break_remaining))
            .toEqual([55, 54, 53, 1]);
        const ended = brk.find((e) => e.event === 'break.ended');
        expect(ended.payload.break_remaining).toBeNull();
        expect(ended.payload.rounds).toHaveLength(2);
        expect(ended.payload.rounds[1].ended_at).toBeNull();

        // tech fall: rounds only, no mat / judges.
        const tf = at('tech fall in round 1 (round.tech-fall, then a break)').find((e) => e.event === 'round.tech-fall');
        expect(Object.keys(tf.payload)).not.toContain('mat');
        expect(Object.keys(tf.payload)).not.toContain('judges');
        expect(tf.payload.break_remaining).toBe(60);

        // the final round: exactly one match.update after the match left the active set, then silence.
        for (const name of ['tech fall in the final round ends the match (one final match.update)',
                            'round timer expiry in the final round ends the match (one final match.update, then silence)']) {
            const list = at(name);
            const endIdx = list.findIndex((e) => e.payload.ended_at !== null);
            const finals = list.slice(endIdx).filter((e) => e.job === 'matchUpdate');
            expect(finals).toHaveLength(1);
            expect(finals[0].payload.ended_at).not.toBeNull();
            expect(Object.keys(finals[0].payload)).toEqual(expect.arrayContaining(['mat', 'judges', 'rounds']));
            expect(list.slice(endIdx).every((e) => e.payload.ended_at !== null)).toBe(true);
        }

        // the combined run: one match ends (timer3) and one starts (starter) in the same tick.
        const allName = 'all at once: concurrent matches, a match ending and one starting in the same tick, a master-ended match';
        const all = at(allName);
        const rooms = new Set(all.map((e) => e.room));
        expect(rooms.size).toBe(Object.keys(E.M).length);
        const tick2 = all.filter((e) => secs(allName, [e])[0] === 2000);
        expect(tick2.some((e) => e.room === `match:${E.M.timer3}` && e.job === 'matchUpdate' && e.payload.ended_at)).toBe(true);
        expect(tick2.some((e) => e.room === `match:${E.M.starter}` && e.job === 'matchUpdate' && e.payload.started_at)).toBe(true);
        // the master-ended match: a final update with the stale break still on it.
        const ender = all.filter((e) => e.room === `match:${E.M.ender}` && e.payload.ended_at);
        expect(ender).toHaveLength(1);
        expect(ender[0].payload.break_remaining).toBe(60);
    });

    it('a tick never needs more statements than the pre-migration implementation did (reported)', () => {
        const ofScenario = statements.filter((s) => s.scenario.startsWith('all at once: concurrent'));
        const sum = (job) => ofScenario.filter((s) => s.job === job).reduce((a, s) => a + s.n, 0);
        const oneTick = (job, at) => ofScenario.find((s) => s.job === job && s.at === at).n;
        const report = { total: {}, tickAt5s: {}, quietTickAt5250ms: { matchUpdate: oneTick('matchUpdate', 5250) } };
        for (const job of E.ALL) {
            report.total[job] = { now: sum(job), preMigration: PRE_MIGRATION_STATEMENTS[job] };
            report.tickAt5s[job] = oneTick(job, 5000);
        }
        // eslint-disable-next-line no-console
        console.log('[statements, "all at once" scenario]', JSON.stringify(report));
        for (const job of E.ALL) {
            expect(sum(job)).toBeGreaterThan(0);
            expect(sum(job)).toBeLessThanOrEqual(PRE_MIGRATION_STATEMENTS[job]);
        }
    });
});
