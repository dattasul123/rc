// All authenticated API calls go through here so the D1 bookmark travels with
// the session (see functions/utils/session.js): the server returns one on every
// response, we keep the newest, and send it back on the next request. That is
// what stops a read replica from answering with data older than what this
// browser has already been shown — its own lookups, most of all.
const BOOKMARK_HEADER = 'x-d1-bookmark';
const BOOKMARK_KEY = 'd1_bookmark';

export async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});

    const token = localStorage.getItem('token');
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const bookmark = localStorage.getItem(BOOKMARK_KEY);
    if (bookmark) headers.set(BOOKMARK_HEADER, bookmark);

    const res = await fetch(path, { ...options, headers });

    const next = res.headers.get(BOOKMARK_HEADER);
    if (next) localStorage.setItem(BOOKMARK_KEY, next);

    return res;
}

// A bookmark belongs to the session of the person who was signed in; keeping it
// past a logout would only send a stranger's position to the next account.
export function clearBookmark() {
    localStorage.removeItem(BOOKMARK_KEY);
}
