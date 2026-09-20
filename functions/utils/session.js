// D1 Sessions — read replication support.
//
// With read replication enabled, a read can be answered by a replica near the
// request instead of by the primary (see wrangler.toml for where the primary
// lives). A replica can lag behind, so reads go through a *session*: every query
// in one session is sequentially consistent, and the session's bookmark — handed
// to the client and sent back on its next request — extends that guarantee
// across requests, so a client is never shown state older than what it has
// already been shown (including its own writes).
//
// Until read replication is switched on for the database, every query is served
// by the primary and these sessions change nothing.

export const BOOKMARK_HEADER = 'x-d1-bookmark';

// Bookmarks are opaque to us and arrive from the client, so anything that isn't
// shaped like one is ignored rather than passed to D1 (which would throw).
const BOOKMARK_PATTERN = /^[0-9a-f-]{10,128}$/i;

export function openSession(context) {
    const { request, env } = context;

    // Only a GET may be answered from a replica. A request that writes has to
    // start from the primary: /api/user/rc-lookup reads a credit balance and
    // then spends real money at the provider on the strength of it, so it can
    // never act on a stale copy.
    let constraint = 'first-primary';
    if (request.method === 'GET') {
        const sent = request.headers.get(BOOKMARK_HEADER);
        constraint = sent && BOOKMARK_PATTERN.test(sent) ? sent : 'first-unconstrained';
    }

    // Older runtimes have no Sessions API; the plain binding behaves the same,
    // just without replica reads.
    if (typeof env.DB?.withSession !== 'function') return env.DB;

    try {
        return env.DB.withSession(constraint);
    } catch (e) {
        // A bookmark D1 rejects (expired, or from another database) must not take
        // the endpoint down with it.
        console.warn(`Falling back to an unconstrained D1 session: ${e.message}`);
        return env.DB.withSession('first-unconstrained');
    }
}

// Hand the session's latest bookmark back to the client, which sends it on its
// next request. Responses are immutable once returned, so this rebuilds one.
export function withBookmark(response, session) {
    const bookmark = typeof session?.getBookmark === 'function' ? session.getBookmark() : null;
    if (!bookmark) return response;

    const out = new Response(response.body, response);
    out.headers.set(BOOKMARK_HEADER, bookmark);
    return out;
}
