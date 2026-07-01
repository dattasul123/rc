import { getUserById } from '../../utils/db.js';

export async function onRequestGet(context) {
    try {
        const { env, data } = context;
        const userId = data.user.id;

        const user = await getUserById(env.DB, userId);
        if (!user) {
            return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
        }

        return new Response(JSON.stringify({ credits: user.credits }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
