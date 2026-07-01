import { verifyJWT } from '../../utils/jwt.js';

export async function onRequest(context) {
    const { request, env } = context;
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyJWT(token, env.JWT_SECRET || 'fallback_secret_for_local_dev');

    if (!payload) {
        return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (payload.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Attach user payload to context data
    context.data = context.data || {};
    context.data.user = payload;

    return await context.next();
}
