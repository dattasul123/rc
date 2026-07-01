import { verifyJWT } from '../../utils/jwt.js';

export async function onRequestPost({ request, env }) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ isAdmin: false }), { status: 200 });
        }

        const token = authHeader.split(' ')[1];
        const payload = await verifyJWT(token, env.JWT_SECRET || 'fallback_secret_for_local_dev');

        if (payload && payload.role === 'admin') {
            return new Response(JSON.stringify({ isAdmin: true }), { status: 200 });
        }

        return new Response(JSON.stringify({ isAdmin: false }), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ isAdmin: false }), { status: 200 });
    }
}
