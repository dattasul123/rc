// Owner-only gate for the credit ledger.
//
// The people this ledger watches are admins themselves — they have to be, to
// hand out credits — so role === 'admin' cannot separate the owner from the
// staff being reviewed. Access is therefore pinned to one email address held in
// the LEDGER_OWNER_EMAIL secret.
//
// Every rejection returns the same 404 "Not Found" that a mistyped path would,
// including for a logged-in admin. A 403 would confirm the endpoint exists and
// tell an employee they are being audited.

import { verifyJWT } from '../../utils/jwt.js';

function notFound() {
    return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequest(context) {
    const { request, env } = context;

    // With no owner configured the ledger does not exist at all, rather than
    // falling open to every admin.
    if (!env.LEDGER_OWNER_EMAIL) return notFound();

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return notFound();

    const payload = await verifyJWT(
        authHeader.split(' ')[1],
        env.JWT_SECRET || 'fallback_secret_for_local_dev'
    );
    if (!payload) return notFound();

    const owner = String(env.LEDGER_OWNER_EMAIL).trim().toLowerCase();
    if (String(payload.email || '').trim().toLowerCase() !== owner) return notFound();

    context.data = context.data || {};
    context.data.user = payload;

    return await context.next();
}
