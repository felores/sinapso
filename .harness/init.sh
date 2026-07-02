#!/usr/bin/env bash
# Bootstrap dev environment for Solaris.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm install
echo "Ready. Gates: npm test | npm run typecheck | npm run dev (manual UI checks)"
