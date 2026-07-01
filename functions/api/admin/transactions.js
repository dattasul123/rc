export async function onRequestGet(context) {
    try {
        const { env } = context;
        
        const { results } = await env.DB.prepare(
            `SELECT t.*, u.email as user_email, a.email as admin_email 
             FROM transactions t
             LEFT JOIN users u ON t.user_id = u.id
             LEFT JOIN users a ON t.admin_id = a.id
             ORDER BY t.created_at DESC`
        ).all();

        return new Response(JSON.stringify({ transactions: results }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
