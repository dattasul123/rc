-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
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

-- Global key/value settings, managed by admins and applied to all users.
-- e.g. 'premium_threshold' = minimum credit balance required to run a lookup.
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- A user must have MORE than this many credits to run a lookup (0 = must have > 0).
INSERT INTO settings (key, value) VALUES ('premium_threshold', '0');

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
