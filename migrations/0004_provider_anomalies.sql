-- Migration: provider observability. Records anomalous IDSPay responses --
-- nested/undocumented error codes (e.g. data.errors.code 1004 inside a 200
-- "success" envelope), masked or missing mobile numbers, and missing owner
-- name / address / pincode -- together with the raw response body, so live
-- behavior the provider docs don't cover can be analyzed later.
-- Apply against an existing database (schema.sql is only for a fresh DB).
--   Local:  npx wrangler d1 execute rc-lookup-db --local  --file=./migrations/0004_provider_anomalies.sql
--   Remote: npx wrangler d1 execute rc-lookup-db --remote --file=./migrations/0004_provider_anomalies.sql

CREATE TABLE provider_anomalies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    rc_number TEXT NOT NULL,
    endpoint TEXT NOT NULL,             -- 'srv1/rc-to-mobile' or 'srv2/validation/rc'
    http_status INTEGER,                -- HTTP status of the provider response (0 = network failure)
    provider_status_code INTEGER,       -- status.code from the response envelope
    provider_status_type TEXT,          -- status.type ('success' can wrap an error)
    provider_error_code TEXT,           -- nested error code, e.g. data.errors.code
    provider_error_message TEXT,
    missing_fields TEXT,                -- comma list of expected-but-missing fields
    raw_response TEXT,                  -- provider body, truncated
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_provider_anomalies_created ON provider_anomalies(created_at);
