-- lookup_history and transactions had no indexes at all: every dashboard load,
-- admin list and CSV export scanned the whole table and then sorted it. Cheap
-- today (a few thousand rows) but it grows with every lookup, and each of these
-- queries is already paying a long round trip to reach the database.

-- /api/user/history and /api/user/lookups-export: filter by user, newest first.
CREATE INDEX IF NOT EXISTS idx_lookup_history_user_date
    ON lookup_history(user_id, lookup_date DESC);

-- /api/admin/history and /api/admin/lookups: every row, newest first.
CREATE INDEX IF NOT EXISTS idx_lookup_history_date
    ON lookup_history(lookup_date DESC);

-- Per-user transaction lists.
CREATE INDEX IF NOT EXISTS idx_transactions_user_created
    ON transactions(user_id, created_at DESC);

-- /api/admin/transactions and /ledger: every row, newest first.
CREATE INDEX IF NOT EXISTS idx_transactions_created
    ON transactions(created_at DESC);
