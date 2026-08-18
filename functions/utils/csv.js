// Shared CSV plumbing for the lookup exports (admin and user). The two routes
// differ only in which rows they are allowed to read and which columns they
// show, so everything about quoting, filenames and headers lives here.

// RFC 4180: wrap in quotes if the value holds a comma, quote or newline, and
// double up any embedded quotes. Provider addresses contain all three.
export function csvCell(value) {
    if (value === null || value === undefined) return '';
    const s = String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// `columns` is [[header, read], ...] so each route picks its own shape.
export function toCsv(rows, columns) {
    const lines = [columns.map(([header]) => header).join(',')];
    for (const row of rows) {
        lines.push(columns.map(([, read]) => csvCell(read(row))).join(','));
    }
    // Leading BOM, otherwise Excel opens UTF-8 addresses as mojibake.
    return '﻿' + lines.join('\r\n') + '\r\n';
}

// The file is named after the user, and that name is whatever was typed into
// Create User. Strip what a filesystem rejects, and \r\n along with it — those
// would let a name break out of the Content-Disposition header.
export function csvFilename(fullName, userId) {
    const cleaned = (fullName || '')
        .replace(/[\\/:*?"<>|\r\n]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return `${cleaned || `user-${userId}`}.csv`;
}

// Non-ASCII names still have to travel in a header: send a stripped-down
// filename for old clients and the real one via RFC 5987 filename*.
export function contentDisposition(filename) {
    const ascii = filename.replace(/[^\x20-\x7e]/g, '_');
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function csvResponse(body, filename) {
    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': contentDisposition(filename),
            // Without this the browser can hand back a stale export after the
            // user has run more lookups.
            'Cache-Control': 'no-store'
        }
    });
}
