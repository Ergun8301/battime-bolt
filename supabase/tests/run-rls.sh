#!/usr/bin/env bash
# Lance un test RLS sur un Postgres JETABLE (dossier temporaire), jamais sur une vraie base.
#   bash supabase/tests/run-rls.sh supabase/tests/lot2_cout_salarie_rls.sql
set -euo pipefail
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
[ -n "$BIN" ] || BIN=$(dirname "$(command -v initdb)")
DIR=$(mktemp -d)
PORT=${PGTEST_PORT:-54329}
# Postgres refuse de tourner en root : on passe par l'utilisateur `postgres` si besoin.
AS=()
if [ "$(id -u)" = 0 ]; then chown postgres "$DIR"; AS=(runuser -u postgres --); fi
trap '"${AS[@]}" "$BIN/pg_ctl" -D "$DIR" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"${AS[@]}" "$BIN/initdb" -D "$DIR" -U postgres -A trust >/dev/null
"${AS[@]}" "$BIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
psql -h "$DIR" -p "$PORT" -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f "$1" 2>&1 | sed -n 's/^psql:[^N]*NOTICE:  //p;/ÉCHEC\|ERROR/p' | grep -E '^ok —|ÉCHEC|ERROR'
