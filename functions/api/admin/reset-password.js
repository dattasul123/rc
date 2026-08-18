// Admin-initiated password reset.
//
// There is deliberately no route that reveals an existing password: passwords
// are stored as PBKDF2 salt:hash (see utils/crypto.js), which is one-way, so the
// original text does not exist anywhere to be read back. An admin who needs to
// get a user in sets a new password here and passes that on.

import { getUserById, updateUserPassword } from '../../utils/db.js';
import { hashPassword } from '../../utils/crypto.js';

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const { userId, newPassword } = await request.json();

        if (!userId || !newPassword) {
            return jsonResponse({ error: 'userId and newPassword are required' }, 400);
        }

        // Same floor the self-service change and Create User enforce.
        if (String(newPassword).length < 8) {
            return jsonResponse({ error: 'New password must be at least 8 characters' }, 400);
        }

        const user = await getUserById(env.DB, userId);
        if (!user) {
            return jsonResponse({ error: 'User not found' }, 404);
        }

        const success = await updateUserPassword(env.DB, userId, await hashPassword(newPassword));
        if (!success) {
            return jsonResponse({ error: 'Failed to update password' }, 500);
        }

        return jsonResponse({
            success: true,
            message: `Password updated for ${user.email}`
        });
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}
