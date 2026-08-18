// CSV export of the signed-in user's own lookups -> "my-lookups.csv".
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

// No user_id/user_name/user_email here — it is all one person's own data, so
// repeating their identity on every row adds nothing.
const COLUMNS = [
    ['owner_name', r => r.owner_name],
    ['mobile_number', r => r.mobile_number],
    ['present_address', r => r.present_address],
    ['pincode', r => r.pincode],
    ['rc_number', r => r.rc_number],
    ['vehicle_number', r => r.vehicle_number],
    ['credits_deducted', r => r.credits_deducted],
    ['lookup_date', r => r.lookup_date]
];

export async function onRequestGet(context) {
    try {
        const { env, data } = context;
        const userId = data.user.id;

        const { results } = await env.DB.prepare(
            `SELECT rc_number, owner_name, mobile_number, vehicle_number,
                    present_address, pincode, credits_deducted, lookup_date
             FROM lookup_history
             WHERE user_id = ?
             ORDER BY lookup_date DESC`
        ).bind(userId).all();

        return csvResponse(toCsv(results, COLUMNS), 'my-lookups.csv');
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
