#!/usr/bin/env bash
# Bootstrap dev environment for Sinapso.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm ci
echo "Ready. Gates: npm test && npm run typecheck && npm run build && npm run test:e2e"
