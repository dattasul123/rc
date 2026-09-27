// How often each lookup_history field actually comes back populated, per client
// and across all of them. Since "Allow partial lookup results when mobile is not
// registered in RTO" a saved lookup can be missing almost anything, so "we have
// data for this client" no longer means the same thing for every column — this
// is the map of which columns are dependable and for whom.
//
// rc_number is deliberately absent: it's the input, never empty, so its coverage
// is always 100% and would only pad the table.

// The order here is the order the admin panel renders. `label` is what the panel
// shows; `sql` is the expression that decides whether one row counts as filled.
const COLUMNS = [
    { key: 'owner_name', label: 'Owner name' },
    { key: 'mobile_number', label: 'Mobile number' },
    { key: 'vehicle_number', label: 'Vehicle number' },
    { key: 'present_address', label: 'Present address' },
    { key: 'pincode', label: 'Pincode' }
];

// A column counts as filled when it holds something other than whitespace, with
// one exception. present_address arrives from the provider as ", 560046" often
// enough that rc-lookup already treats a digits-and-punctuation-only address as
// missing; counting those as coverage here would report an address rate the
// results don't support. GLOB is SQLite's case-sensitive wildcard match, so the
// pattern needs both cases spelled out.
function filledExpr(key) {
    const notBlank = `TRIM(COALESCE(lh.${key}, '')) <> ''`;
    if (key === 'present_address') {
        return `${notBlank} AND lh.${key} GLOB '*[A-Za-z]*'`;
    }
    return notBlank;
}

const FILLED_SUMS = COLUMNS
    .map(c => `SUM(CASE WHEN ${filledExpr(c.key)} THEN 1 ELSE 0 END) AS ${c.key}`)
    .join(',\n                   ');

export async function onRequestGet(context) {
    try {
        const { env } = context;

        // Aggregated in SQL rather than by reading every lookup row: the primary
        // is a long way from where these requests are served, so this is one
        // round trip carrying a few dozen rows instead of the whole table.
        // LEFT JOIN keeps clients who have never run a lookup — a client with no
        // data at all is part of the answer to "how common is this column".
        const perUser = env.DB.prepare(`
            SELECT u.id AS user_id, u.full_name, u.email, u.role, u.created_at,
                   COUNT(lh.id) AS total,
                   ${FILLED_SUMS}
            FROM users u
            LEFT JOIN lookup_history lh ON lh.user_id = u.id
            GROUP BY u.id, u.full_name, u.email, u.role, u.created_at
        `);

        // delete-user removes a client's lookup rows, but rows predating that
        // (or orphaned any other way) still exist and are counted by the Lookups
        // tab and the export-everything CSV. Leaving them out here would make
        // this tab quietly disagree with both.
        const orphaned = env.DB.prepare(`
            SELECT COUNT(lh.id) AS total,
                   ${FILLED_SUMS}
            FROM lookup_history lh
            WHERE lh.user_id NOT IN (SELECT id FROM users)
        `);

        const [perUserRes, orphanedRes] = await env.DB.batch([perUser, orphaned]);

        const clients = perUserRes.results.map(r => ({
            user_id: r.user_id,
            full_name: r.full_name,
            email: r.email,
            role: r.role,
            joined_at: r.created_at,
            total: r.total,
            filled: Object.fromEntries(COLUMNS.map(c => [c.key, r[c.key] || 0]))
        }));

        const orphanRow = orphanedRes.results[0];
        if (orphanRow && orphanRow.total > 0) {
            clients.push({
                user_id: null,
                full_name: 'Deleted user',
                email: '—',
                role: null,
                joined_at: null,
                total: orphanRow.total,
                filled: Object.fromEntries(COLUMNS.map(c => [c.key, orphanRow[c.key] || 0]))
            });
        }

        // Most lookups first: the clients with the most data are the ones whose
        // coverage gaps actually cost something.
        clients.sort((a, b) => b.total - a.total);

        const withData = clients.filter(c => c.total > 0);
        const totalLookups = clients.reduce((sum, c) => sum + c.total, 0);

        // Two different questions, both meant by "how common is this column":
        // how much of the data has it (filled/total), and how many clients see
        // it at all (any) or on every single lookup (all).
        const columns = COLUMNS.map(c => {
            const filled = clients.reduce((sum, cl) => sum + cl.filled[c.key], 0);
            return {
                key: c.key,
                label: c.label,
                filled,
                total: totalLookups,
                clients_any: withData.filter(cl => cl.filled[c.key] > 0).length,
                clients_all: withData.filter(cl => cl.filled[c.key] === cl.total).length,
                clients_none: withData.filter(cl => cl.filled[c.key] === 0).length
            };
        });

        return new Response(JSON.stringify({
            columns,
            clients,
            total_lookups: totalLookups,
            client_count: clients.length,
            clients_with_data: withData.length
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
