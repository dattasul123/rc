// D1 Database helper functions

export async function getUserById(db, id) {
    const { results } = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).all();
    return results[0] || null;
}

export async function getUserByEmail(db, email) {
    const { results } = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).all();
    return results[0] || null;
}

export async function createUser(db, { email, password, full_name, role = 'user', credits = 0 }) {
    const { success, meta } = await db.prepare(
        'INSERT INTO users (email, password, full_name, role, credits) VALUES (?, ?, ?, ?, ?)'
    ).bind(email, password, full_name, role, credits).run();
    return { success, id: meta.last_row_id };
}

export async function addCredits(db, { userId, amount, adminId, description = 'Recharge' }) {
    const batch = await db.batch([
        db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').bind(amount, userId),
        db.prepare(
            'INSERT INTO transactions (user_id, type, amount, description, admin_id) VALUES (?, ?, ?, ?, ?)'
        ).bind(userId, 'credit', amount, description, adminId)
    ]);
    return batch[0].success && batch[1].success;
}

// Admin manual adjustment: `amount` is signed — positive adds credits, negative
// deducts them. Records a matching credit/debit transaction attributed to the admin.
// The caller is responsible for ensuring a deduction won't push the balance below 0
// (see the adjust-credits endpoint).
export async function adjustCredits(db, { userId, amount, adminId, description }) {
    const type = amount >= 0 ? 'credit' : 'debit';
    const batch = await db.batch([
        db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').bind(amount, userId),
        db.prepare(
            'INSERT INTO transactions (user_id, type, amount, description, admin_id) VALUES (?, ?, ?, ?, ?)'
        ).bind(userId, type, Math.abs(amount), description, adminId)
    ]);
    return batch[0].success && batch[1].success;
}

export async function deductCredit(db, { userId, rcNumber }) {
    const batch = await db.batch([
        db.prepare('UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0').bind(userId),
        db.prepare(
            'INSERT INTO transactions (user_id, type, amount, description, rc_number) VALUES (?, ?, ?, ?, ?)'
        ).bind(userId, 'debit', 1, 'RC Lookup', rcNumber)
    ]);
    
    // Check if the update statement actually changed a row (meaning user had > 0 credits)
    const success = batch[0].meta.changes > 0 && batch[1].success;
    return success;
}

export async function saveLookupHistory(db, { userId, rcNumber, mobileNumber, ownerName, vehicleNumber, presentAddress = null, pincode = null, creditsDeducted = 1 }) {
    const { success } = await db.prepare(
        'INSERT INTO lookup_history (user_id, rc_number, mobile_number, owner_name, vehicle_number, present_address, pincode, credits_deducted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, rcNumber, mobileNumber, ownerName, vehicleNumber, presentAddress, pincode, creditsDeducted).run();
    return success;
}

// --- Global settings -----------------------------------------------------------

export async function getSetting(db, key, defaultValue = null) {
    const { results } = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).all();
    return results[0] ? results[0].value : defaultValue;
}

export async function setSetting(db, key, value) {
    const { success } = await db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    ).bind(key, String(value)).run();
    return success;
}

// Global "premium" threshold: a user must have MORE than this many credits to run a
// lookup. Set by admin, applies to all users. Falls back to 0 if unset/invalid.
export async function getPremiumThreshold(db) {
    const raw = await getSetting(db, 'premium_threshold', '0');
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

// --- Shared RC -> Mobile cache -------------------------------------------------

// Return a cached RC lookup only if it exists AND is still fresh (within maxAgeDays).
// A stale entry returns null so the caller re-fetches from the provider and refreshes it.
export async function getCachedRcLookup(db, rcNumber, maxAgeDays = 90) {
    const { results } = await db.prepare(
        `SELECT * FROM rc_mobile_cache
         WHERE rc_number = ?
           AND updated_at > datetime('now', ?)`
    ).bind(rcNumber, `-${maxAgeDays} days`).all();
    return results[0] || null;
}

// Insert a fresh lookup, or refresh an existing entry (rc_number is UNIQUE).
export async function saveRcToCache(db, { rcNumber, mobileNumber, ownerName, vehicleNumber, presentAddress = null, pincode = null, source = 'idspay' }) {
    const { success } = await db.prepare(
        `INSERT INTO rc_mobile_cache (rc_number, mobile_number, owner_name, vehicle_number, present_address, pincode, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(rc_number) DO UPDATE SET
            mobile_number = excluded.mobile_number,
            owner_name = excluded.owner_name,
            vehicle_number = excluded.vehicle_number,
            present_address = excluded.present_address,
            pincode = excluded.pincode,
            source = excluded.source,
            updated_at = CURRENT_TIMESTAMP`
    ).bind(rcNumber, mobileNumber, ownerName, vehicleNumber, presentAddress, pincode, source).run();
    return success;
}

// Bump the served-from-cache counter (a savings metric; not on the critical path).
export async function incrementCacheHit(db, rcNumber) {
    const { success } = await db.prepare(
        'UPDATE rc_mobile_cache SET hit_count = hit_count + 1 WHERE rc_number = ?'
    ).bind(rcNumber).run();
    return success;
}

export async function deleteUser(db, userId) {
    const batch = await db.batch([
        db.prepare('DELETE FROM lookup_history WHERE user_id = ?').bind(userId),
        db.prepare('DELETE FROM transactions WHERE user_id = ?').bind(userId),
        db.prepare('DELETE FROM users WHERE id = ?').bind(userId)
    ]);
    return batch[2].meta.changes > 0;
}

export async function updateUserPassword(db, userId, hashedPassword) {
    const { success } = await db.prepare(
        'UPDATE users SET password = ? WHERE id = ?'
    ).bind(hashedPassword, userId).run();
    return success;
}
