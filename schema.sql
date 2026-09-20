-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,          -- one-way PBKDF2 hash, used for login
    -- Reversible copy encrypted with PASSWORD_RECOVERY_KEY (see utils/recovery.js)
    -- so an admin can read a password back. Null for anyone whose password was
    -- set before recovery existed — those are hash-only and unrecoverable.
    password_recovery TEXT,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'user', -- 'user' or 'admin'
    credits INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'debit' or 'credit'
    amount INTEGER NOT NULL,
    description TEXT,
    rc_number TEXT,
    admin_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (admin_id) REFERENCES users(id)
);

-- Lookup history table
CREATE TABLE lookup_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    rc_number TEXT NOT NULL,
    mobile_number TEXT,
    owner_name TEXT,
    vehicle_number TEXT,
    present_address TEXT,
    pincode TEXT,
    credits_deducted INTEGER DEFAULT 1,
    lookup_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Without these, every history list, admin table and CSV export scans the whole
-- table and sorts it (see migrations/0006_performance_indexes.sql).
CREATE INDEX idx_lookup_history_user_date ON lookup_history(user_id, lookup_date DESC);
CREATE INDEX idx_lookup_history_date ON lookup_history(lookup_date DESC);
CREATE INDEX idx_transactions_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);

-- Global key/value settings, managed by admins and applied to all users.
-- e.g. 'premium_threshold' = minimum credit balance required to run a lookup.
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- A user must have MORE than this many credits to run a lookup (0 = must have > 0).
INSERT INTO settings (key, value) VALUES ('premium_threshold', '0');

-- Anomalous IDSPay responses: nested/undocumented error codes (e.g. data.errors.code
-- 1004 inside a 200 "success" envelope), masked/missing mobile numbers, missing owner
-- name / address / pincode. Raw body kept (truncated) for later analysis.
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

-- Shared RC -> Mobile cache (populated by any user's lookup, reused by all users).
-- Lets us serve a repeat RC from our own DB instead of paying the provider again.
CREATE TABLE rc_mobile_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rc_number TEXT UNIQUE NOT NULL,
    mobile_number TEXT NOT NULL,
    owner_name TEXT,
    vehicle_number TEXT,
    present_address TEXT,           -- RC Plus: registered present address
    pincode TEXT,                   -- RC Plus: present address pincode
    source TEXT DEFAULT 'idspay',   -- where the data came from
    hit_count INTEGER DEFAULT 0,    -- times this entry was served from cache
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- first time we fetched it
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP   -- last provider fetch (used for freshness/TTL)
);
