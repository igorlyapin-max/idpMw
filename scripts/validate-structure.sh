#!/usr/bin/env bash
set -euo pipefail

echo "=== Validating project structure ==="

echo "[1/5] TypeScript compilation check..."
npx tsc --noEmit

echo "[2/5] Prisma schema validation..."
npx prisma validate

echo "[3/5] ESLint check..."
npm run lint

echo "[4/5] Docker Compose dev up..."
docker compose -f docker-compose.dev.yml up -d

echo "[5/5] Waiting for health check..."
for i in {1..30}; do
  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    echo "Health check PASSED"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Health check FAILED"
    exit 1
  fi
  sleep 1
done

echo "=== All checks passed ==="
