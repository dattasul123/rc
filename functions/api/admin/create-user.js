import { hashPassword } from '../../utils/crypto.js';
import { encryptSecret } from '../../utils/recovery.js';
import { createUser, getUserByEmail } from '../../utils/db.js';

export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const { email, password, fullName, role, credits } = await request.json();

        if (!email || !password || !fullName) {
            return new Response(JSON.stringify({ error: 'Email, password and full name are required' }), { status: 400 });
        }

        if (password.length < 8) {
            return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), { status: 400 });
        }

        if (role && role !== 'user' && role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Invalid role' }), { status: 400 });
        }

        const existingUser = await getUserByEmail(env.DB, email);
        if (existingUser) {
            return new Response(JSON.stringify({ error: 'A user with this email already exists' }), { status: 409 });
        }

        const hashedPassword = await hashPassword(password);
        const { success, id } = await createUser(env.DB, {
            email,
            password: hashedPassword,
            full_name: fullName,
            role: role || 'user',
            credits: Number.isInteger(credits) && credits > 0 ? credits : 0,
            // Reversible copy so this password can be read back later. Null if
            // no key is configured — never a reason to fail the signup.
            recovery: await encryptSecret(password, env.PASSWORD_RECOVERY_KEY)
        });

        if (!success) {
            return new Response(JSON.stringify({ error: 'Failed to create user' }), { status: 500 });
        }

        return new Response(JSON.stringify({ success: true, message: `User ${email} created`, id }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
