import { adjustCredits, getUserById } from '../../utils/db.js';

// Admin credit adjustment: add or deduct credits on a user's account.
// Body: { userId, amount (positive), action: 'add' | 'deduct', note? }
export async function onRequestPost(context) {
    try {
        const { request, env, data } = context;
        const adminId = data.user.id;
        const { userId, amount, action = 'add', note } = await request.json();

        const magnitude = parseInt(amount, 10);
        if (!userId || !Number.isFinite(magnitude) || magnitude <= 0) {
            return new Response(JSON.stringify({ error: 'Valid userId and a positive amount are required' }), { status: 400 });
        }

        if (action !== 'add' && action !== 'deduct') {
            return new Response(JSON.stringify({ error: "action must be 'add' or 'deduct'" }), { status: 400 });
        }

        const target = await getUserById(env.DB, userId);
        if (!target) {
            return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
        }

        // Admin always wins: a deduction is never rejected, it just floors the
        // balance at 0. We clamp rather than allow negatives so the lookup
        // credit-gate (credits > 0) keeps behaving sensibly.
        const effective = action === 'deduct' ? Math.min(magnitude, target.credits) : magnitude;

        // Nothing to remove — skip the no-op transaction row.
        if (effective === 0) {
            return new Response(JSON.stringify({
                success: true,
                message: `${target.email} already has 0 credits`,
                newBalance: 0
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        const signed = action === 'deduct' ? -effective : effective;
        const description = note || (action === 'deduct' ? 'Admin Deduction' : 'Admin Recharge');

        const success = await adjustCredits(env.DB, { userId, amount: signed, adminId, description });
        if (!success) {
            return new Response(JSON.stringify({ error: 'Failed to update credits' }), { status: 500 });
        }

        const verb = action === 'deduct' ? 'Removed' : 'Added';
        const preposition = action === 'deduct' ? 'from' : 'to';
        return new Response(JSON.stringify({
            success: true,
            message: `${verb} ${effective} credits ${preposition} ${target.email}`,
            newBalance: target.credits + signed
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
