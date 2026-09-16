/**
 * The capture side of the contract goldens.
 *
 * Two jobs:
 *
 *  1. **Completeness oracle (plan 7a/7d).** Runs the full capture plan and
 *     fails loudly if any route in `artifacts/route-table.txt` has no golden
 *     and no documented justification. Run it with coverage to find actions
 *     that were *reached* but only on one branch:
 *
 *         bun test --isolate --coverage test/contract/capture.test.js
 *
 *  2. **Regeneration**, but only on demand:
 *
 *         CAPTURE_GOLDENS=1 bun test --isolate test/contract/capture.test.js
 *
 *     Goldens are NOT rewritten during a normal test run. If they were, the
 *     gate would be self-healing: a rewrite that changed the wire contract
 *     would silently update the evidence and stay green. Regenerating is a
 *     deliberate act whose diff must be reviewed.
 */
const { afterAll, describe, expect, it, jest } = require('bun:test');
const Http = require('../helpers/httpServer');

// Must happen before any model module opens a connection.
Http.useTemporaryDatabase('accord-contract-capture');

const { buildCoverageReport, runAll, writeGoldens } = require('./capture.ts');

const WRITE = process.env.CAPTURE_GOLDENS === '1';

const clock = { set: ms => jest.setSystemTime(new Date(ms)) };


describe('contract capture', () => {
    afterAll(() => { jest.useRealTimers(); });

    it('captures the whole surface and leaves no route uncovered', async () => {
        const result = await runAll(clock);
        const report = buildCoverageReport(result);

        console.log('\n' + report.lines.join('\n'));

        if (WRITE) {
            const written = writeGoldens(result);
            console.log(`wrote ${written.length} goldens to test/contract/goldens/`);
        } else {
            console.log('goldens NOT rewritten (set CAPTURE_GOLDENS=1 to regenerate)');
        }

        // 7d — incompleteness must be loud, not silent.
        expect(report.uncovered).toEqual([]);

        // Every WebSocket event the client subscribes to in SocketClient must
        // have produced a real payload, not a null placeholder.
        const wsEvents = result.records
            .filter(r => r.name.startsWith('ws.'))
            .map(r => r.body.event);
        expect(wsEvents).toContain('match.update');
        expect(wsEvents).toContain('round.tech-fall');
        expect(wsEvents).toContain('break.ended');
        for (const record of result.records.filter(r => r.name.startsWith('ws.'))) {
            expect(record.body.payload).not.toBeNull();
        }
    }, 120000);
});
