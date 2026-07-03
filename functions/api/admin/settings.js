import { getPremiumThreshold, setSetting } from '../../utils/db.js';

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequestGet(context) {
    try {
        const { env } = context;
        const premiumThreshold = await getPremiumThreshold(env.DB);
        return jsonResponse({ premiumThreshold });
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}

export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const { premiumThreshold } = await request.json();
        const value = parseInt(premiumThreshold, 10);

        if (!Number.isFinite(value) || value < 0) {
            return jsonResponse({ error: 'premiumThreshold must be a non-negative integer' }, 400);
        }

        const success = await setSetting(env.DB, 'premium_threshold', value);
        if (!success) {
            return jsonResponse({ error: 'Failed to update premium threshold' }, 500);
        }

        return jsonResponse({
            success: true,
            premiumThreshold: value,
            message: `Premium threshold set to ${value} credits`
        });
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}
