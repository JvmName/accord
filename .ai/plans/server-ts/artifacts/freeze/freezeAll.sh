#!/bin/sh
# Task 15a: run every freeze script once, from server/ (the legacy migrator resolves
# config/db/migrations against the cwd). FREEZE_OUT_DIR overrides the output directory.
set -e
cd "$(dirname "$0")/../../../../../server"
for s in freezeLifecycle freezeEmissions freezeRepositories freezeWebSocketTier freezePermissions freezeErrorRendering; do
  echo "== $s"
  timeout 300 bun "../.ai/plans/server-ts/artifacts/freeze/$s.js" < /dev/null 2>&1 | grep -E '^(wrote|legacy statements)|rror' || true
done
