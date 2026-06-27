#!/bin/bash
# Creates one database per service on first Postgres boot (database-per-service).
# Driven by POSTGRES_MULTIPLE_DATABASES (comma-separated) from the environment.
set -euo pipefail

if [ -n "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
  IFS=',' read -ra DBS <<< "$POSTGRES_MULTIPLE_DATABASES"
  for db in "${DBS[@]}"; do
    db="$(echo "$db" | xargs)"  # trim whitespace
    echo "  -> creating database '$db'"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-SQL
      SELECT 'CREATE DATABASE "$db"'
      WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
SQL
  done
fi
