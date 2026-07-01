import { hashPassword } from '../../utils/crypto.js';
import { createUser, getUserByEmail } from '../../utils/db.js';

export async function onRequestPost({ request, env }) {
    try {
        const { email, password, fullName } = await request.json();

        if (!email || !password || !fullName) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
        }

        const existingUser = await getUserByEmail(env.DB, email);
        if (existingUser) {
            return new Response(JSON.stringify({ error: 'User already exists' }), { status: 409 });
        }

        const hashedPassword = await hashPassword(password);
        await createUser(env.DB, { email, password: hashedPassword, full_name: fullName });

        return new Response(JSON.stringify({ success: true, message: 'User created successfully' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
