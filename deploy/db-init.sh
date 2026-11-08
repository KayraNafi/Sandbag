#!/bin/sh
# Runs once, when the database is first created. The API owns its own tables and nothing
# else, and each worker gets only the few rows it needs, granted by a migration.
set -eu
psql -v ON_ERROR_STOP=1 -v app="$APP_DB_PASSWORD" -v push="$PUSH_DB_PASSWORD" -v imports="$IMPORTS_DB_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE sandbag_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app';
CREATE ROLE sandbag_push LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'push';
CREATE ROLE sandbag_imports LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'imports';
ALTER DATABASE sandbag OWNER TO sandbag_app;
ALTER SCHEMA public OWNER TO sandbag_app;
SQL
