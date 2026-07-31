// Recent anomalous provider responses (undocumented error codes, masked/missing
// mobile, missing name/address/pincode), newest first. raw_response is included
// so undocumented live behavior can be inspected verbatim.
export async function onRequestGet(context) {
    try {
        const { env } = context;

        const { results } = await env.DB.prepare(`
            SELECT pa.*, u.email as user_email, u.full_name as user_name
            FROM provider_anomalies pa
            LEFT JOIN users u ON pa.user_id = u.id
            ORDER BY pa.created_at DESC
            LIMIT 200
        `).all();

        return new Response(JSON.stringify({ anomalies: results }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
