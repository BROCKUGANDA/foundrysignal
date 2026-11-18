#!/usr/bin/env bash
# Snapshot the local SQLite DB (sandbox). Production uses managed backups.
set -euo pipefail
SRC="${DATABASE_URL:-file:./db/custom.db}"
TS=$(date +%Y%m%d-%H%M%S)
OUT="backups/foundrysignal-${TS}.db"
mkdir -p backups
if [[ "$SRC" == file:* ]]; then
  cp "${SRC#file:}" "$OUT"
else
  echo "Non-file DB; use pg_dump instead." >&2
  exit 1
fi
echo "Backup written to $OUT"