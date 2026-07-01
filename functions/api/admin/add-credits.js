import { addCredits } from '../../utils/db.js';

export async function onRequestPost(context) {
    try {
        const { request, env, data } = context;
        const adminId = data.user.id;
        const { userId, amount, note } = await request.json();

        if (!userId || !amount || amount <= 0) {
            return new Response(JSON.stringify({ error: 'Valid userId and positive amount are required' }), { status: 400 });
        }

        const success = await addCredits(env.DB, {
            userId,
            amount,
            adminId,
            description: note || 'Admin Recharge'
        });

        if (!success) {
            return new Response(JSON.stringify({ error: 'Failed to add credits' }), { status: 500 });
        }

        return new Response(JSON.stringify({ success: true, message: `Added ${amount} credits to user ${userId}` }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
