// Every lookup anyone has ever run, clubbed under the user who ran it.
// /api/admin/history returns the same rows flat; this one groups them so the
// admin panel can show one line per user and expand into their results, and so
// the per-user totals shown on screen come from the same place the CSV does.
export async function onRequestGet(context) {
    try {
        const { env } = context;

        const [usersRes, lookupsRes] = await Promise.all([
            env.DB.prepare(
                'SELECT id, email, full_name, role, credits, created_at FROM users'
            ).all(),
            env.DB.prepare(`
                SELECT id, user_id, rc_number, owner_name, mobile_number,
                       vehicle_number, present_address, pincode,
                       credits_deducted, lookup_date
                FROM lookup_history
                ORDER BY lookup_date DESC
            `).all()
        ]);

        const byUser = new Map(usersRes.results.map(u => [u.id, {
            user_id: u.id,
            full_name: u.full_name,
            email: u.email,
            role: u.role,
            credits_remaining: u.credits,
            joined_at: u.created_at,
            lookup_count: 0,
            credits_used: 0,
            with_mobile: 0,
            last_lookup: null,
            lookups: []
        }]));

        // delete-user leaves lookup_history behind, so rows can outlive the user
        // row they point at. They still have to land somewhere or the totals here
        // quietly disagree with what an export-everything CSV contains.
        const orphaned = {
            user_id: null,
            full_name: 'Deleted user',
            email: '—',
            role: null,
            credits_remaining: null,
            joined_at: null,
            lookup_count: 0,
            credits_used: 0,
            with_mobile: 0,
            last_lookup: null,
            lookups: []
        };

        for (const row of lookupsRes.results) {
            const bucket = byUser.get(row.user_id) || orphaned;
            bucket.lookups.push(row);
            bucket.lookup_count += 1;
            bucket.credits_used += row.credits_deducted || 0;
            if (row.mobile_number) bucket.with_mobile += 1;
            // Rows come back newest-first, so the first one we see for a user is
            // their latest.
            if (!bucket.last_lookup) bucket.last_lookup = row.lookup_date;
        }

        const users = [...byUser.values()];
        if (orphaned.lookup_count > 0) users.push(orphaned);

        // Busiest first — that's who an admin is looking for.
        users.sort((a, b) => b.lookup_count - a.lookup_count);

        return new Response(JSON.stringify({
            users,
            total_lookups: lookupsRes.results.length
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
