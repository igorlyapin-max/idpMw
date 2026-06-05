#!/bin/bash
set -e

echo "Setting up SQLite database for idpMw..."

export DATABASE_PROVIDER=sqlite
export DATABASE_URL="file:./data/idpmw.db"
export LIGHTWEIGHT_MODE=true

# Ensure data directory exists
mkdir -p data

# Generate Prisma client for SQLite
npx prisma generate --schema=prisma/schema.sqlite.prisma

# Push schema to SQLite database
npx prisma db push --schema=prisma/schema.sqlite.prisma

echo "SQLite setup complete. Database: $DATABASE_URL"
