// Admin-readable password recovery.
//
// Login still authenticates against the one-way PBKDF2 hash in crypto.js — that
// does not change. Alongside it we keep a second, *reversible* copy so an admin
// can read back a password when a client has forgotten what their colleague set.
//
// It is encrypted rather than stored as plain text on purpose. The key lives in
// the PASSWORD_RECOVERY_KEY secret, not in D1, so a dumped database is not a
// list of every client's password. Reading these values requires having
// compromised the Worker's secrets as well.
//
// Stored format: base64(iv):base64(ciphertext), AES-GCM with a fresh 12-byte IV
// per password.

const ALGO = 'AES-GCM';
const IV_BYTES = 12;

const toB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function importKey(rawKeyB64) {
    const raw = fromB64(rawKeyB64);
    if (raw.length !== 32) {
        throw new Error('PASSWORD_RECOVERY_KEY must be 32 bytes, base64-encoded');
    }
    return crypto.subtle.importKey('raw', raw, { name: ALGO }, false, ['encrypt', 'decrypt']);
}

// Returns null when no key is configured, so callers can carry on saving the
// hash. A missing key must never block a password change.
export async function encryptSecret(plaintext, rawKeyB64) {
    if (!rawKeyB64) return null;
    const key = await importKey(rawKeyB64);
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ciphertext = await crypto.subtle.encrypt(
        { name: ALGO, iv },
        key,
        new TextEncoder().encode(plaintext)
    );
    return `${toB64(iv)}:${toB64(ciphertext)}`;
}

export async function decryptSecret(stored, rawKeyB64) {
    if (!stored || !rawKeyB64) return null;
    const [ivB64, dataB64] = String(stored).split(':');
    if (!ivB64 || !dataB64) return null;
    const key = await importKey(rawKeyB64);
    const plaintext = await crypto.subtle.decrypt(
        { name: ALGO, iv: fromB64(ivB64) },
        key,
        fromB64(dataB64)
    );
    return new TextDecoder().decode(plaintext);
}
