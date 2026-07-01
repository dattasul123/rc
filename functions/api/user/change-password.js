import { getUserById, updateUserPassword } from '../../utils/db.js';
import { verifyPassword, hashPassword } from '../../utils/crypto.js';

export async function onRequestPost(context) {
    try {
        const { request, env, data } = context;
        const userId = data.user.id;
        const { oldPassword, newPassword } = await request.json();

        if (!oldPassword || !newPassword) {
            return new Response(JSON.stringify({ error: 'Old password and new password are required' }), { status: 400 });
        }

        if (newPassword.length < 8) {
            return new Response(JSON.stringify({ error: 'New password must be at least 8 characters' }), { status: 400 });
        }

        const user = await getUserById(env.DB, userId);
        if (!user) {
            return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
        }

        const isValid = await verifyPassword(oldPassword, user.password);
        if (!isValid) {
            return new Response(JSON.stringify({ error: 'Incorrect old password' }), { status: 401 });
        }

        const newHashedPassword = await hashPassword(newPassword);
        const success = await updateUserPassword(env.DB, userId, newHashedPassword);

        if (!success) {
            return new Response(JSON.stringify({ error: 'Failed to update password' }), { status: 500 });
        }

        return new Response(JSON.stringify({ success: true, message: 'Password updated successfully' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
