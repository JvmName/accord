# Snapshot fixtures

Recorded expected behavior of the server, checked by the tests listed below. The
first versions were recorded from the implementation that preceded the current
one, so these files also prove that the current code behaves the same way.

| File | Checked by | What one record is |
|---|---|---|
| `seed.jsonl` | `test/services/lifecycleParity.test.js` | One row of the contract seed (`test/contract/seed.ts`), keyed `table:rowid`. |
| `lifecycle.jsonl` | `test/services/lifecycleParity.test.js` | One lifecycle scenario (`test/services/lifecycleScenarios.js`): its outcome, the ordered writes, and the row changes. |
| `emissions.jsonl` | `test/workers/emissionDifferential.test.js` | Part of one worker timeline (`test/workers/emissionScenarios.js`): a summary, a payload, one room's emissions, or one step's writes. |
| `repositories.jsonl` | `test/db/repositories/differential.test.js` | The result of one read query over the seed (`differentialQueries.js`). |
| `webSocketTier.jsonl` | `test/ws/webSocketTier.test.js` | What one Socket.IO client script observed, one handler outcome, or one lookup (`test/ws/webSocketScripts.js`). |
| `permissions.jsonl` | `test/http/permissions.test.ts` | The grant/deny row of one subject over every scope and action (`test/http/permissionGrid.js`). |
| `errorRendering.jsonl` | `test/http/envelope.test.ts` | The status and body rendered for one thrown error (`test/http/errorCases.js`). |

## Format

JSON Lines. The first line is a header (format version, suite, record count,
where the first version came from). Every other line is one record with a
unique `key`. Object keys are sorted, so the same data always gives the same
bytes and a change touches only the records it affects.

Compact encodings:

- **Row changes** are written per table as `["+", rowid, row]` (new row),
  `["~", rowid, {column: value}]` (changed columns) or `["-", rowid]`
  (removed row), relative to the state before the command ran.
- **Ids** that would differ between runs are labels: `<seed:table:n>` for ids
  the seed generates at random, `<gen:n>` for ids created during a scenario,
  numbered by first appearance.
- **Seed rows in query results** are references (`users:3`) to rows of
  `seed.jsonl`; any other row is written out in full.
- **Emissions** are grouped by room as `[step, job, event, payload index]`;
  each distinct payload is stored once in a `... | payload n` record.
- **Permissions** list the axes once in the `axes` record; each subject record
  has one string per scope with one character per action: `G` grant, `d` deny,
  or a digit naming a thrown error in the `axes` legend.
- `{"$undefined": true}` marks a value that is `undefined` rather than `null`.

## Updating

Never edit these files by hand. After a deliberate behavior change:

```sh
bun run test:update-fixtures            # regenerate from the current code
bun run test:update-fixtures --check    # list the files that would change
```

Then review the diff record by record: every changed line is a behavior
change and must be one you intended. On unchanged code the script rewrites
every file byte for byte.
