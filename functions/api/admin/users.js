export async function onRequestGet(context) {
    try {
        const { env } = context;
        // In a real app we might paginate or search here, but returning all for now.
        const { results } = await env.DB.prepare('SELECT id, email, full_name, role, credits, created_at FROM users').all();

        return new Response(JSON.stringify({ users: results }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
