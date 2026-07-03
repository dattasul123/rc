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

export async function saveLookupHistory(db, { userId, rcNumber, mobileNumber, ownerName, vehicleNumber }) {
    const { success } = await db.prepare(
        'INSERT INTO lookup_history (user_id, rc_number, mobile_number, owner_name, vehicle_number) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, rcNumber, mobileNumber, ownerName, vehicleNumber).run();
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
