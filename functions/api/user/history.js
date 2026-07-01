export async function onRequestGet(context) {
    try {
        const { env, data } = context;
        const userId = data.user.id;

        const { results } = await env.DB.prepare(
            'SELECT * FROM lookup_history WHERE user_id = ? ORDER BY lookup_date DESC'
        ).bind(userId).all();

        return new Response(JSON.stringify({ history: results }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
