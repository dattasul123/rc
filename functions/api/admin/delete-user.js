import { deleteUser, getUserById } from '../../utils/db.js';

export async function onRequestPost(context) {
    try {
        const { request, env, data } = context;
        const adminId = data.user.id;
        const { userId } = await request.json();

        if (!userId) {
            return new Response(JSON.stringify({ error: 'userId is required' }), { status: 400 });
        }

        if (String(userId) === String(adminId)) {
            return new Response(JSON.stringify({ error: 'You cannot delete your own account' }), { status: 400 });
        }

        const target = await getUserById(env.DB, userId);
        if (!target) {
            return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
        }

        const success = await deleteUser(env.DB, userId);
        if (!success) {
            return new Response(JSON.stringify({ error: 'Failed to delete user' }), { status: 500 });
        }

        return new Response(JSON.stringify({ success: true, message: `User ${target.email} deleted` }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
