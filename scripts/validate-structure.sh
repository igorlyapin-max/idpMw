#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=== Validating idmMw project ==="

echo "[1/5] TypeScript compilation check"
npx tsc --noEmit

echo "[2/5] Prisma schema validation"
npx prisma validate

echo "[3/5] Unit tests"
npm test -- --runInBand

echo "[4/5] SQLite e2e contract tests"
npm run test:e2e:sqlite

echo "[5/5] Runtime smoke: startup, /health, /metrics, diagnostic logs"
npm run test:runtime-smoke

echo "=== All checks passed ==="
