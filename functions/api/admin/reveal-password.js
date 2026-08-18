// Reveals a user's current password to an admin.
//
// Reads the reversible copy written by create-user / change-password /
// reset-password and decrypts it with PASSWORD_RECOVERY_KEY. Behind the admin
// _middleware, so a non-admin token gets a 403 before reaching this code.
//
// POST rather than GET on purpose: a password must not end up in a URL, where
// it would be kept in browser history, proxy logs and the Referer header.
//
// Passwords set before this feature shipped exist only as PBKDF2 hashes and are
// genuinely unrecoverable — those return recoverable:false, and the only way
// forward for that user is to set a new password.

import { getUserRecovery } from '../../utils/db.js';
import { decryptSecret } from '../../utils/recovery.js';

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            // Never let a password sit in a cache.
            'Cache-Control': 'no-store'
        }
    });
}

export async function onRequestPost(context) {
    try {
        const { request, env, data } = context;
        const { userId } = await request.json();

        if (!userId) {
            return jsonResponse({ error: 'userId is required' }, 400);
        }

        if (!env.PASSWORD_RECOVERY_KEY) {
            return jsonResponse({
                error: 'Password recovery is not configured. Set the PASSWORD_RECOVERY_KEY secret.'
            }, 501);
        }

        const user = await getUserRecovery(env.DB, Number(userId));
        if (!user) {
            return jsonResponse({ error: 'User not found' }, 404);
        }

        if (!user.password_recovery) {
            return jsonResponse({
                success: true,
                recoverable: false,
                message: 'This password was set before recovery was enabled, so only a one-way hash exists. Set a new password to make it readable from now on.'
            });
        }

        let password;
        try {
            password = await decryptSecret(user.password_recovery, env.PASSWORD_RECOVERY_KEY);
        } catch {
            // Wrong key, or a value written under a previous key.
            return jsonResponse({
                success: true,
                recoverable: false,
                message: 'Stored password could not be decrypted — PASSWORD_RECOVERY_KEY has probably changed since it was saved. Set a new password to re-establish it.'
            });
        }

        // Who read whose password, so the access is not silent.
        console.log(`Password revealed for user ${user.id} (${user.email}) by admin ${data.user.id}`);

        return jsonResponse({ success: true, recoverable: true, password });
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}
