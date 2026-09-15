# Artifacts

Baselines and evidence captured by tasks, consumed by later tasks as gates. **Commit these** — a baseline that only existed in one session's scrollback cannot gate anything.

| File | Written by | Consumed by | What it is |
|---|---|---|---|
| `route-table.txt` | `01` | `13a`, `13b`, `13c`, `15` | Every registered `METHOD /path`, plus the count. The reference the routing rewrite is diffed against. |
| `test-baseline.txt` | `01` | `02` | Jest pass/fail/skip counts per file, pre-migration. |
| `bun-test-baseline.txt` | `02` | every later task | Post-port counts under `bun test`. "At the task-02 baseline" in the plans means this file. |
| `coverage-capture.txt` | `04` | `04` | Coverage over `controllers/` during golden capture — the completeness oracle. Any action at zero coverage was never captured. |
| `mutation-log.txt` | `04` | `04` | Which negative-control mutations were applied and confirmed to fail the goldens. |
| `openapi-diff.txt` | `06` | `06`, `12` | Generated vs. hand-written spec components, with each difference classified. |
| `authz-matrix.txt` | `02b` | `12`, `15` | The authorization table (role × action × resource → allow/deny), including deny cases. |

Later tasks may add their own; extend this table when they do.
