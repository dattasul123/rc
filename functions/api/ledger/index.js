// Credit-grant ledger: every credit handed to a user, and which staff account
// handed it over.
//
// GET  /api/ledger  -> all grants, newest first, plus the review checkpoint
// POST /api/ledger  -> move the checkpoint to now ("I have seen everything up
//                      to here"). Rows added after it are flagged as new on the
//                      next visit.
//
// The checkpoint lives in the existing settings table rather than a new one, so
// this ships without a migration.

import { getSetting, setSetting } from '../../utils/db.js';

const REVIEWED_KEY = 'ledger_reviewed_at';

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            // An audit trail must never be served from cache.
            'Cache-Control': 'no-store'
        }
    });
}

export async function onRequestGet(context) {
    try {
        const { env } = context;

        // type = 'credit' is a grant; debits are lookups the user spent.
        // admin_id is null when nobody was recorded as the granter, which is
        // itself worth seeing, so it is left in rather than filtered out.
        const [grants, reviewedAt] = await Promise.all([
            env.DB.prepare(
                `SELECT t.id, t.user_id, t.amount, t.description, t.created_at,
                        t.admin_id,
                        u.full_name  AS user_name,
                        u.email      AS user_email,
                        a.full_name  AS admin_name,
                        a.email      AS admin_email
                 FROM transactions t
                 LEFT JOIN users u ON t.user_id  = u.id
                 LEFT JOIN users a ON t.admin_id = a.id
                 WHERE t.type = 'credit'
                 ORDER BY t.created_at DESC, t.id DESC`
            ).all(),
            getSetting(env.DB, REVIEWED_KEY, null)
        ]);

        return jsonResponse({ grants: grants.results, reviewedAt });
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}

export async function onRequestPost(context) {
    try {
        const { env } = context;
        // Stored in the same shape SQLite's CURRENT_TIMESTAMP writes, so the
        // frontend can compare it against created_at without special-casing.
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
        const success = await setSetting(env.DB, REVIEWED_KEY, now);
        if (!success) return jsonResponse({ error: 'Failed to save checkpoint' }, 500);
        return jsonResponse({ success: true, reviewedAt: now });
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}
