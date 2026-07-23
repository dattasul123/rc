export async function onRequestGet(context) {
    try {
        const { env } = context;

        const { results } = await env.DB.prepare(`
            SELECT lh.*, u.email as user_email, u.full_name as user_name
            FROM lookup_history lh
            LEFT JOIN users u ON lh.user_id = u.id
            ORDER BY lh.lookup_date DESC
        `).all();

        return new Response(JSON.stringify({ history: results }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
