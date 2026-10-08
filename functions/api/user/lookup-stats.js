import { getLookupStats } from '../../utils/db.js';

// Per-user lookup success rate, approximated from existing data (see getLookupStats).
export async function onRequestGet(context) {
    try {
        const { env, data } = context;
        const db = data.session || env.DB;
        const stats = await getLookupStats(db, data.user.id);
        return new Response(JSON.stringify({ stats }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
