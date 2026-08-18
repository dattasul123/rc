// Admin-initiated password reset.
//
// Also stores the reversible recovery copy, so a password set here can be read
// back later through reveal-password.js.

import { getUserById, updateUserPassword } from '../../utils/db.js';
import { hashPassword } from '../../utils/crypto.js';
import { encryptSecret } from '../../utils/recovery.js';

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

        const success = await updateUserPassword(
            env.DB,
            userId,
            await hashPassword(newPassword),
            await encryptSecret(newPassword, env.PASSWORD_RECOVERY_KEY)
        );
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
