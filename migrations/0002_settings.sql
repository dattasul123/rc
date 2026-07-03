-- Migration: global settings key/value store + premium threshold seed.
-- Apply against an existing database (schema.sql is only for a fresh DB).
--   Local:  npx wrangler d1 execute rc-lookup-db --local  --file=./migrations/0002_settings.sql
--   Remote: npx wrangler d1 execute rc-lookup-db --remote --file=./migrations/0002_settings.sql

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed the global premium threshold (a user must have MORE than this to run a lookup).
INSERT OR IGNORE INTO settings (key, value) VALUES ('premium_threshold', '0');
