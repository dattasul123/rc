import { verifyPassword } from '../../utils/crypto.js';
import { signJWT } from '../../utils/jwt.js';
import { getUserByEmail } from '../../utils/db.js';

export async function onRequestPost({ request, env }) {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return new Response(JSON.stringify({ error: 'Email and password required' }), { status: 400 });
        }

        const user = await getUserByEmail(env.DB, email);
        if (!user) {
            return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
        }

        const isValid = await verifyPassword(password, user.password);
        if (!isValid) {
            return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
        }

        const payload = {
            id: user.id,
            email: user.email,
            role: user.role,
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
        };

        const token = await signJWT(payload, env.JWT_SECRET || 'fallback_secret_for_local_dev');

        return new Response(JSON.stringify({ 
            success: true, 
            token, 
            user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role, credits: user.credits } 
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
