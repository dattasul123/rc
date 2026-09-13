// CSV export of the signed-in user's own lookups.
//   /api/user/lookups-export?from=2026-09-01&to=2026-09-13 -> "lookups_2026-09-01_to_2026-09-13.csv"
//   /api/user/lookups-export?from=2026-09-13&to=2026-09-13 -> "lookups_2026-09-13.csv"
//   /api/user/lookups-export                               -> every date, as "lookups_all-dates.csv"
//
// Scope comes from the JWT via _middleware (context.data.user), never from the
// query string: a userId parameter here would let any user export anyone's
// results. The admin route is the one that takes a userId, behind the admin
// middleware.
//
// The user _middleware demands a Bearer token, which a plain <a href="..."> or
// window.open cannot send. The frontend therefore fetches this with the header,
// turns the body into a blob and clicks it.

import { toCsv, csvResponse } from '../../utils/csv.js';

// lookup_date is SQLite's CURRENT_TIMESTAMP, i.e. UTC. Users think in Indian
// days, so both the date filter and the printed timestamp are shifted to IST —
// otherwise a lookup at 1 AM on the 13th would land in the file for the 12th.
const IST = "'+330 minutes'";

// No user_id/user_name/user_email here — it is all one person's own data, so
// repeating their identity on every row adds nothing.
//
// The date leads each row so the all-dates file reads (and filters in Excel)
// day by day; the time sits at the end.
const COLUMNS = [
    ['lookup_date (IST)', r => r.lookup_day],
    ['owner_name', r => r.owner_name],
    ['mobile_number', r => r.mobile_number],
    ['present_address', r => r.present_address],
    ['pincode', r => r.pincode],
    ['rc_number', r => r.rc_number],
    ['vehicle_number', r => r.vehicle_number],
    ['credits_deducted', r => r.credits_deducted],
    ['lookup_time (IST)', r => r.lookup_time]
];

// A real calendar date in YYYY-MM-DD, so 2026-02-30 is refused rather than
// silently matching nothing. The value also ends up in the filename.
function isDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function badRequest(error) {
    return new Response(JSON.stringify({ error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequestGet(context) {
    try {
        const { env, data, request } = context;
        const userId = data.user.id;
        const params = new URL(request.url).searchParams;
        const from = params.get('from');
        const to = params.get('to');

        if ((from === null) !== (to === null)) {
            return badRequest('Pass both from and to, or neither');
        }
        const ranged = from !== null;
        if (ranged && (!isDate(from) || !isDate(to))) {
            return badRequest('Dates must be YYYY-MM-DD');
        }
        if (ranged && from > to) {
            return badRequest('From date is after To date');
        }

        const { results } = await env.DB.prepare(
            `SELECT rc_number, owner_name, mobile_number, vehicle_number,
                    present_address, pincode, credits_deducted,
                    date(lookup_date, ${IST}) AS lookup_day,
                    time(lookup_date, ${IST}) AS lookup_time
             FROM lookup_history
             WHERE user_id = ?
             ${ranged ? `AND date(lookup_date, ${IST}) BETWEEN ? AND ?` : ''}
             ORDER BY lookup_date DESC`
        ).bind(...(ranged ? [userId, from, to] : [userId])).all();

        const filename = !ranged ? 'lookups_all-dates.csv'
            : from === to ? `lookups_${from}.csv`
            : `lookups_${from}_to_${to}.csv`;

        return csvResponse(toCsv(results, COLUMNS), filename);
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
