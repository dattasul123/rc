-- Migration: shared RC -> Mobile cache.
-- Apply against an existing database (schema.sql is only for a fresh DB).
--   Local:  npx wrangler d1 execute rc-lookup-db --local  --file=./migrations/0001_rc_mobile_cache.sql
--   Remote: npx wrangler d1 execute rc-lookup-db --remote --file=./migrations/0001_rc_mobile_cache.sql

CREATE TABLE IF NOT EXISTS rc_mobile_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rc_number TEXT UNIQUE NOT NULL,
    mobile_number TEXT NOT NULL,
    owner_name TEXT,
    vehicle_number TEXT,
    source TEXT DEFAULT 'idspay',
    hit_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
