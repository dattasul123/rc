// CSV export of lookup results.
//   /api/admin/lookups-export?userId=7  -> that user's lookups, as "Ravi Sharma.csv"
//   /api/admin/lookups-export           -> everyone, as "all-lookups.csv"
//
// The admin _middleware demands a Bearer token, which a plain <a href="..."> or
// window.open cannot send. The frontend therefore fetches this with the header,
// turns the body into a blob and clicks it — and reads the filename back out of
// Content-Disposition below, so the naming lives in one place.

const COLUMNS = [
    ['user_id', r => r.user_id],
    ['user_name', r => r.user_name],
    ['user_email', r => r.user_email],
    ['owner_name', r => r.owner_name],
    ['mobile_number', r => r.mobile_number],
    ['present_address', r => r.present_address],
    ['pincode', r => r.pincode],
    ['rc_number', r => r.rc_number],
    ['vehicle_number', r => r.vehicle_number],
    ['credits_deducted', r => r.credits_deducted],
    ['lookup_date', r => r.lookup_date]
];

// RFC 4180: wrap in quotes if the value holds a comma, quote or newline, and
// double up any embedded quotes. Provider addresses contain all three.
function csvCell(value) {
    if (value === null || value === undefined) return '';
    const s = String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
    const lines = [COLUMNS.map(([header]) => header).join(',')];
    for (const row of rows) {
        lines.push(COLUMNS.map(([, read]) => csvCell(read(row))).join(','));
    }
    // Leading BOM, otherwise Excel opens UTF-8 addresses as mojibake.
    return '﻿' + lines.join('\r\n') + '\r\n';
}

// The file is named after the user, and that name is whatever an admin typed
// into Create User. Strip what a filesystem rejects, and \r\n along with it —
// those would let a name break out of the Content-Disposition header.
function csvFilename(fullName, userId) {
    const cleaned = (fullName || '')
        .replace(/[\\/:*?"<>|\r\n]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return `${cleaned || `user-${userId}`}.csv`;
}

// Non-ASCII names still have to travel in a header: send a stripped-down
// filename for old clients and the real one via RFC 5987 filename*.
function contentDisposition(filename) {
    const ascii = filename.replace(/[^\x20-\x7e]/g, '_');
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function onRequestGet(context) {
    try {
        const { env, request } = context;
        const userId = new URL(request.url).searchParams.get('userId');

        // The value ends up in a filename, so it never gets to be anything but
        // digits.
        if (userId !== null && !/^\d+$/.test(userId)) {
            return new Response(JSON.stringify({ error: 'userId must be a number' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const select = `
            SELECT lh.user_id, lh.rc_number, lh.owner_name, lh.mobile_number,
                   lh.vehicle_number, lh.present_address, lh.pincode,
                   lh.credits_deducted, lh.lookup_date,
                   u.full_name AS user_name, u.email AS user_email
            FROM lookup_history lh
            LEFT JOIN users u ON lh.user_id = u.id
        `;

        let filename = 'all-lookups.csv';
        let results;

        if (userId === null) {
            ({ results } = await env.DB.prepare(`${select} ORDER BY lh.user_id, lh.lookup_date DESC`).all());
        } else {
            // Read the name off the user row rather than the joined lookups, so a
            // user with no lookups yet still gets a properly named (header-only)
            // file instead of falling back to the id.
            const [owner, lookups] = await Promise.all([
                env.DB.prepare('SELECT full_name FROM users WHERE id = ?').bind(Number(userId)).first(),
                env.DB.prepare(`${select} WHERE lh.user_id = ? ORDER BY lh.lookup_date DESC`)
                    .bind(Number(userId)).all()
            ]);
            results = lookups.results;
            filename = csvFilename(owner?.full_name, userId);
        }

        return new Response(toCsv(results), {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': contentDisposition(filename),
                // Without this the browser can hand back a stale export after
                // the user has run more lookups.
                'Cache-Control': 'no-store'
            }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
