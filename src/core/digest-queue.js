// Which stored sessions still owe a summary.
//
// The transcript reaches disk before the summary call starts, so a summary lost to
// a crash or a closed app is not lost data — it is unfinished work that can be
// redone. Sessions are marked explicitly when the work begins (D24): deducing it
// from "has no summary" would sweep up the whole back catalogue, including sessions
// recorded before summaries existed, and spend a model call on each one unasked.

const MAX_DIGEST_ATTEMPTS = 3;

function selectPendingDigests(sessions, { maxAttempts = MAX_DIGEST_ATTEMPTS } = {}) {
    if (!Array.isArray(sessions)) return [];

    return sessions
        .filter(session => session && session.digestPending === true && !session.digest && (session.digestAttempts || 0) < maxAttempts)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

module.exports = { selectPendingDigests, MAX_DIGEST_ATTEMPTS };
