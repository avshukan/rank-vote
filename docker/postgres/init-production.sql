-- The official entrypoint runs this only on empty PGDATA. psql reads the
-- password from its environment, never from argv or shell interpolation.
\set ECHO none
SET log_statement = 'none';
SET log_min_error_statement = 'panic';
\getenv app_password POSTGRES_APP_PASSWORD
CREATE ROLE rank_vote_app LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE DATABASE rank_vote_prod OWNER rank_vote_app;
REVOKE ALL ON DATABASE rank_vote_prod FROM PUBLIC;
\connect rank_vote_prod
ALTER SCHEMA public OWNER TO rank_vote_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
