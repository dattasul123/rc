import {
    getLookupPreflight,
    deductCredit,
    saveLookupHistory,
    saveProviderAnomaly
} from '../../utils/db.js';

// The client picks which upstream answers the lookup. Exactly one is called —
// there is deliberately no cross-server fallback, so a lookup always returns what
// the chosen server said and users can retry on the other one themselves.
//
//   Server 1 (default) — Ecuzen: one call returns owner name, mobile and addresses.
//   Server 2           — IDSPay RC To Mobile: returns a mobile number and nothing
//                        else, so name/address come back as N/A.
const SERVER_ECUZEN = '1';
const SERVER_IDSPAY = '2';
const DEFAULT_SERVER = SERVER_ECUZEN;
const SERVER_LABELS = { [SERVER_ECUZEN]: 'Server 1', [SERVER_IDSPAY]: 'Server 2' };

const DEFAULT_ECUZEN_BASE_URL = 'https://xapi.ecuzen.in';
const ECUZEN_ENDPOINT = '/api/verify/vehicle';

const DEFAULT_IDSPAY_BASE_URL = 'https://javabackend.idspay.in/api/v1/prod';
const REQUIRED_IDSPAY_ENV = ['IDSPAY_API_ID', 'IDSPAY_API_KEY', 'IDSPAY_TOKEN_ID'];

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

// POST JSON to a provider endpoint. Never throws: on a network or parse failure it
// returns ok:false so a failing call can't abort the whole lookup.
// The raw body is kept so anomalous responses can be stored for analysis.
async function postJson(url, body, extraHeaders = {}) {
    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...extraHeaders },
            body: JSON.stringify(body)
        });
        const text = await resp.text();
        let json = {};
        try {
            json = text ? JSON.parse(text) : {};
        } catch {
            json = {};
        }
        if (!resp.ok) {
            console.error(`Provider call to ${url} failed with HTTP ${resp.status}: ${text.slice(0, 300)}`);
        }
        return { ok: resp.ok, status: resp.status, json, text, error: null };
    } catch (err) {
        console.error(`Provider call to ${url} failed with network error: ${err?.message || err}`);
        return { ok: false, status: 0, json: {}, text: '', error: err?.message || 'Network error' };
    }
}

// Ecuzen requires a client-generated transaction id that is unique per request.
function buildTxnId() {
    const random = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
        .replace(/-/g, '')
        .slice(0, 16)
        .toUpperCase();
    return `RC${Date.now().toString(36).toUpperCase()}${random}`;
}

// The two providers report success differently: Ecuzen puts a plain string at the
// top level, IDSPay wraps everything in {status:{type,code,message}, data:{...}}.
function ecuzenSucceeded(call) {
    return Boolean(call?.ok) && String(call?.json?.status || '').trim().toUpperCase() === 'SUCCESS';
}

function idsPaySucceeded(call) {
    return Boolean(call?.ok) && String(call?.json?.status?.type || '').trim().toLowerCase() === 'success';
}

// Anomalies are rare, so a few KB of raw body per row is enough for analysis
// without bloating D1.
const RAW_RESPONSE_LIMIT = 4096;

// Describe an anomalous provider response: a transport failure, a non-success
// envelope, a nested error object (undocumented — IDSPay can put data.errors
// inside a 200 "success" envelope), or expected fields missing from an otherwise
// successful payload. `succeeded` is supplied by the caller because each provider
// signals success in its own shape. Returns null when the response looks healthy.
function buildAnomaly(call, missingFields, succeeded) {
    const nested = call?.json?.data?.errors ?? call?.json?.errors;
    const nestedError = nested && typeof nested === 'object'
        && (nested.code !== undefined || nested.message !== undefined)
        ? nested
        : null;
    const rawStatus = call?.json?.status;
    const statusType = typeof rawStatus === 'object' && rawStatus !== null
        ? (rawStatus.type ?? null)
        : (rawStatus ?? null);
    const statusCode = typeof rawStatus === 'object' && rawStatus !== null ? (rawStatus.code ?? null) : null;
    const failed = !succeeded;

    if (!failed && !nestedError && missingFields.length === 0) return null;

    return {
        httpStatus: call?.status ?? 0,
        providerStatusCode: statusCode,
        providerStatusType: statusType === null ? null : String(statusType),
        providerErrorCode: nestedError && nestedError.code !== undefined ? String(nestedError.code) : null,
        providerErrorMessage: (nestedError && nestedError.message)
            || (failed ? (providerMessage(call) || call?.error || null) : null),
        missingFields: missingFields.length > 0 ? missingFields.join(',') : null,
        rawResponse: (call?.text || call?.error || '').slice(0, RAW_RESPONSE_LIMIT) || null
    };
}

// Best-effort human-readable reason out of either provider's error shape.
function providerMessage(call) {
    if (!call) return '';
    const json = call.json || {};
    const nested = json?.data?.errors ?? json?.errors;
    const candidates = [
        json.message,
        json.error,
        typeof json.error === 'object' ? json.error?.message : null,
        json?.status?.message,
        nested && typeof nested === 'object'
            ? (nested.message || (nested.code ? `Provider error: ${nested.code}` : null))
            : null
    ];
    for (const candidate of candidates) {
        if (candidate && typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    return '';
}

function normalizeFieldName(key) {
    return String(key).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Depth-first search for the first non-empty scalar whose normalized key equals
// `candidate`. A direct scalar on the current object wins over any nested match.
function findByKey(value, candidate, depth = 0) {
    if (!value || depth > 5) return '';

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findByKey(item, candidate, depth + 1);
            if (found) return found;
        }
        return '';
    }

    if (typeof value !== 'object') return '';

    for (const [key, fieldValue] of Object.entries(value)) {
        if (normalizeFieldName(key) === candidate && fieldValue && typeof fieldValue !== 'object') {
            return String(fieldValue).trim();
        }
    }

    for (const fieldValue of Object.values(value)) {
        const found = findByKey(fieldValue, candidate, depth + 1);
        if (found) return found;
    }

    return '';
}

// Try each alias in priority order and return the first hit. Priority follows the
// order of `candidateKeys` (NOT the provider's key order), so e.g. present_address
// always wins over permanent_address. Provider field names vary between endpoints.
function findFieldValue(value, candidateKeys) {
    for (const candidate of candidateKeys) {
        const found = findByKey(value, candidate);
        if (found) return found;
    }
    return '';
}

function readProviderMobile(value) {
    // Ecuzen returns `owner_mobile_number`; RC To Mobile v3 nests the resolved
    // number at data.data.mobileNo.
    return findFieldValue(value, ['ownermobilenumber', 'mobileno', 'mobilenumber', 'mobile']);
}

function readProviderName(value) {
    // Ecuzen and RC Advance V2 both use `owner_name`; other endpoints use
    // `owner` / `ownerName`.
    return findFieldValue(value, ['ownername', 'owner', 'name']);
}

// Normalize the free-text address for display: exactly one space after each comma
// and no double spaces. Providers return it comma-packed with no spaces.
function tidyAddress(address) {
    return String(address || '').replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();
}

// Ecuzen returns `addresses: [{type, complete_address}]` with no guaranteed order,
// so the current address is picked by type rather than by position. The key-search
// fallback covers older/leaner payload shapes.
function readProviderAddress(value) {
    const list = Array.isArray(value?.addresses) ? value.addresses : [];
    const byType = (type) => list.find(
        (entry) => normalizeFieldName(entry?.type) === type && entry?.complete_address
    )?.complete_address;

    const chosen = byType('currentaddress')
        || byType('presentaddress')
        || byType('permanentaddress')
        || list.find((entry) => entry?.complete_address)?.complete_address
        || findFieldValue(value, ['completeaddress', 'presentaddress', 'permanentaddress', 'addressline', 'address']);

    return tidyAddress(chosen);
}

// Prefer an explicit pincode field; Ecuzen has none, so this normally falls back
// to the last 6-digit run in the address. May legitimately be empty.
function readProviderPincode(value, address = '') {
    const explicit = findFieldValue(value, ['pincode', 'pin']);
    if (explicit) {
        const digits = explicit.replace(/\D/g, '');
        if (digits.length === 6) return digits;
    }
    const matches = String(address).match(/\d{6}/g);
    return matches ? matches[matches.length - 1] : '';
}

// A number is only usable when it is a real 10-digit Indian mobile. Providers
// sometimes return a masked ("98XXXXXX12") or sample value inside a success
// envelope, which must be treated as no number at all.
function evaluateMobile(raw) {
    const providerMobile = String(raw || '').trim();
    const digits = providerMobile.replace(/\D/g, '');
    const normalized = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
    const masked = Boolean(providerMobile) && (/[xX*]/.test(providerMobile) || !/^\d{10}$/.test(normalized));
    return {
        providerMobile,
        normalized,
        masked,
        valid: Boolean(providerMobile) && !masked && /^\d{10}$/.test(normalized)
    };
}

export async function onRequestPost(context) {
    try {
        const { request, env, data } = context;
        const userId = data.user.id;
        // Reads and writes share the request's session (primary-first for a POST),
        // so the bookmark returned to the client already covers this lookup.
        const db = data.session || env.DB;
        const { rcNumber, server } = await request.json();
        // Anything unrecognized falls back to the default rather than erroring —
        // an older client that sends no server at all still works.
        const selectedServer = server === SERVER_IDSPAY ? SERVER_IDSPAY : DEFAULT_SERVER;
        // Canonicalize to bare alphanumerics (uppercase). Users type spaces/hyphens
        // ("HR 26 EZ 2802"); the providers reject those. Both accept the compact form.
        const vehicleNumber = String(rcNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

        if (!vehicleNumber) {
            return jsonResponse({ error: 'RC Number is required' }, 400);
        }

        if (vehicleNumber.length < 5) {
            return jsonResponse({ success: false, message: 'Invalid RC number format' }, 400);
        }

        // The user row and the global "premium" threshold (admin-set: a user must
        // have MORE than this many credits to run a lookup) are fetched in one
        // batched round trip — neither depends on the other, and a second
        // sequential query would cost the client another ~350ms.
        const { user, premiumThreshold } = await getLookupPreflight(db, userId);
        if (!user || user.credits <= premiumThreshold) {
            const message = premiumThreshold > 0
                ? `A minimum balance above ${premiumThreshold} credits is required to run a lookup`
                : 'Insufficient credits';
            return jsonResponse({ error: message }, 403);
        }

        // Every lookup queries the provider live — there is no result cache.
        // (A shared cache previously served stale data from superseded endpoints.)

        // Only the selected server is contacted, so only its credentials matter.
        const usingEcuzen = selectedServer === SERVER_ECUZEN;
        const serverLabel = SERVER_LABELS[selectedServer];
        const configured = usingEcuzen
            ? Boolean(env.ECUZEN_API_KEY)
            : REQUIRED_IDSPAY_ENV.every((key) => Boolean(env[key]));
        if (!configured) {
            console.error(`${serverLabel} is not configured: set ${usingEcuzen ? 'ECUZEN_API_KEY' : REQUIRED_IDSPAY_ENV.join(', ')}`);
            return jsonResponse({
                success: false,
                message: `${serverLabel} is not configured. Try the other server.`
            }, 503);
        }

        // --- Server 1: Ecuzen vehicle verification ------------------------------
        // One POST returns name, mobile and addresses together. It is billed on
        // every lookup, including ones that come back without a mobile and are
        // therefore never charged to the client.
        const vehicleCall = usingEcuzen
            ? await postJson(
                `${(env.ECUZEN_BASE_URL || DEFAULT_ECUZEN_BASE_URL).replace(/\/+$/, '')}${ECUZEN_ENDPOINT}`,
                { vehicle_number: vehicleNumber, txnid: buildTxnId() },
                { 'api-key': env.ECUZEN_API_KEY }
            )
            : null;
        const vehicleOk = ecuzenSucceeded(vehicleCall);
        const vehicleData = vehicleOk ? vehicleCall.json : null;

        // --- Server 2: IDSPay RC To Mobile (first of two IDSPay calls) ----------
        // Resolves the mobile number. null, not a failed call: it means we
        // deliberately never asked, and everything downstream tells those apart.
        const mobileCall = usingEcuzen
            ? null
            : await postJson(
                `${(env.IDSPAY_BASE_URL || DEFAULT_IDSPAY_BASE_URL).replace(/\/+$/, '')}/srv1/rc-to-mobile`,
                {
                    api_id: env.IDSPAY_API_ID,
                    api_key: env.IDSPAY_API_KEY,
                    token_id: env.IDSPAY_TOKEN_ID,
                    vehicle_num: vehicleNumber
                }
            );

        const mobile = usingEcuzen
            ? evaluateMobile(vehicleOk ? readProviderMobile(vehicleData) : '')
            : evaluateMobile(idsPaySucceeded(mobileCall) ? readProviderMobile(mobileCall.json?.data) : '');
        const hasValidMobile = mobile.valid;

        // --- Server 2: IDSPay RC Advance V2 (second IDSPay call) ----------------
        // Adds owner name + address, reached only once RC To Mobile produced a
        // usable number. IDSPay bills each call, and a lookup without a mobile is
        // never charged to the client, so firing this on a failed lookup would
        // spend provider credit on a result we give away. null means never asked.
        const advanceCall = (!usingEcuzen && hasValidMobile)
            ? await postJson(
                `${(env.IDSPAY_BASE_URL || DEFAULT_IDSPAY_BASE_URL).replace(/\/+$/, '')}/srv2/validation/rc`,
                {
                    api_id: env.IDSPAY_API_ID,
                    api_key: env.IDSPAY_API_KEY,
                    token_id: env.IDSPAY_TOKEN_ID,
                    reg_no: vehicleNumber
                }
            )
            : null;
        const advanceOk = idsPaySucceeded(advanceCall);
        const advanceData = advanceOk ? advanceCall.json?.data : null;

        // Owner details come from whichever server answered: Ecuzen's vehicle
        // payload on Server 1, RC Advance V2's data on Server 2. Both shapes are
        // handled by the same readProvider* helpers.
        const ownerSource = usingEcuzen ? vehicleData : advanceData;
        const providerName = ownerSource ? readProviderName(ownerSource) : '';
        const providerAddress = ownerSource ? readProviderAddress(ownerSource) : '';
        const providerPincode = ownerSource ? readProviderPincode(ownerSource, providerAddress) : '';

        // --- Observability: store anomalous provider behavior before any early
        // return, so failed lookups are captured too. waitUntil keeps it off the
        // response path; a failed write only logs.
        const vehicleMissing = [];
        if (vehicleOk) {
            if (!mobile.providerMobile) vehicleMissing.push('owner_mobile_number');
            else if (mobile.masked) vehicleMissing.push('owner_mobile_number(masked)');
            if (!providerName) vehicleMissing.push('owner_name');
            if (!providerAddress) vehicleMissing.push('complete_address');
            // An address like ", 560046" (digits/punctuation only, no locality
            // text) is effectively missing — seen live, not in the docs.
            else if (!providerAddress.replace(/[\d\s,.-]/g, '')) vehicleMissing.push('complete_address(pincode_only)');
            if (!providerPincode) vehicleMissing.push('pincode');
        }

        const mobileMissing = [];
        if (mobileCall && idsPaySucceeded(mobileCall)) {
            if (!mobile.providerMobile) mobileMissing.push('mobileNo');
            else if (mobile.masked) mobileMissing.push('mobileNo(masked)');
        }

        const advanceMissing = [];
        if (advanceOk) {
            if (!providerName) advanceMissing.push('owner_name');
            if (!providerAddress) advanceMissing.push('present_address');
            // An address like ", 560046" (digits/punctuation only, no locality
            // text) is effectively missing — seen live, not in the docs.
            else if (!providerAddress.replace(/[\d\s,.-]/g, '')) advanceMissing.push('present_address(pincode_only)');
            if (!providerPincode) advanceMissing.push('pincode');
        }

        // A call that was never made has nothing to say about itself and is left
        // out rather than recorded as a failure.
        const auditable = [];
        if (vehicleCall) auditable.push(['ecuzen/verify/vehicle', vehicleCall, vehicleMissing, vehicleOk]);
        if (mobileCall) auditable.push(['srv1/rc-to-mobile', mobileCall, mobileMissing, idsPaySucceeded(mobileCall)]);
        if (advanceCall) auditable.push(['srv2/validation/rc', advanceCall, advanceMissing, advanceOk]);

        for (const [endpoint, call, missing, succeeded] of auditable) {
            const anomaly = buildAnomaly(call, missing, succeeded);
            if (!anomaly) continue;
            context.waitUntil(
                saveProviderAnomaly(db, { userId, rcNumber: vehicleNumber, endpoint, ...anomaly })
                    .catch((e) => console.error(`Failed to record provider anomaly for ${endpoint}: ${e.message}`))
            );
        }
        // --------------------------------------------------------------

        // The call that decides whether the lookup succeeds — the one that resolves
        // the mobile. On Server 2 that is RC To Mobile; RC Advance only enriches.
        const providerCall = usingEcuzen ? vehicleCall : mobileCall;
        const providerSucceeded = usingEcuzen ? vehicleOk : idsPaySucceeded(mobileCall);

        if (providerCall && !providerCall.ok) {
            console.warn(`${serverLabel} call failed for ${vehicleNumber}: HTTP ${providerCall.status || 0}`, providerCall.error || providerCall.text?.slice(0, 200));
        }
        // A failed RC Advance does not fail the lookup — the mobile still stands,
        // and name/address fall back to N/A.
        if (advanceCall && !advanceCall.ok) {
            console.warn(`RC Advance V2 call failed for ${vehicleNumber}: HTTP ${advanceCall.status || 0}`, advanceCall.error || advanceCall.text?.slice(0, 200));
        }

        // No usable mobile ends the lookup here, unbilled — even when Server 1 did
        // return a name and address. There is no fallback to the other server: the
        // user chose this one and can retry on the other.
        if (!hasValidMobile) {
            console.error(`RC lookup failure for ${vehicleNumber} on ${serverLabel}: no usable mobile`, {
                ok: providerCall?.ok, status: providerCall?.status, error: providerCall?.error
            });

            if (mobile.masked) {
                return jsonResponse({
                    success: false,
                    message: 'Provider returned masked/sample data. Confirm the production API credentials and endpoint are active.'
                }, 502);
            }

            let message = providerMessage(providerCall);

            if (/rc to mobile lookup failed/i.test(message) || /no\s*(record|data)/i.test(message)) {
                message = 'No records found for this vehicle registration number.';
            } else if (!message) {
                if (providerCall?.error) {
                    message = `RC lookup connection error: ${providerCall.error}`;
                } else if (providerSucceeded) {
                    // The server answered normally; the vehicle simply has no
                    // number linked to it. Never echo the raw body back here — it
                    // is a well-formed success payload, not an error to show.
                    message = 'No mobile number is linked to this vehicle. Try the other server.';
                } else if (providerCall?.status) {
                    const snippet = (providerCall?.text || '').replace(/<[^>]*>/g, '').trim().slice(0, 100);
                    message = `${serverLabel} returned HTTP ${providerCall.status}${snippet ? ` (${snippet})` : ''}`;
                } else {
                    message = 'Vehicle lookup was unsuccessful. Please check the RC number.';
                }
            }

            return jsonResponse({
                success: false,
                message,
                status: providerCall?.status ?? 0,
                errorType: providerCall?.error ? 'network_error' : (!providerCall?.ok ? 'http_error' : 'provider_rejected')
            }, 502);
        }

        // Past the guard above a mobile is guaranteed, so a result is never the
        // mobile-less "partial" kind the dashboard banner describes. The field
        // stays in the payload so the dashboard's contract is unchanged; it is now
        // always false. A mobile sourced from the backup can still arrive without a
        // name or address — that shows as "N/A", not as a partial result.
        const result = {
            mobileNumber: mobile.normalized,
            ownerName: providerName || 'N/A',
            address: providerAddress || 'N/A',
            pincode: providerPincode || 'N/A',
            vehicleNumber,
            rcNumber: vehicleNumber,
            partial: false,
            server: selectedServer,
            serverLabel
        };
        // --------------------------------------------------------------

        // Deduct credit (only after a successful lookup)
        const deducted = await deductCredit(db, { userId, rcNumber: result.rcNumber });
        if (!deducted) {
            return jsonResponse({ error: 'Failed to deduct credit' }, 500);
        }

        // Save history off the response path. Nothing in the response depends on
        // it, and awaiting it held the client for another D1 round trip after the
        // charge had already gone through. A failed write now only logs — the
        // lookup itself still succeeded and was still billed exactly once.
        context.waitUntil(
            saveLookupHistory(db, {
                userId,
                rcNumber: result.rcNumber,
                mobileNumber: result.mobileNumber,
                ownerName: result.ownerName,
                vehicleNumber: result.vehicleNumber,
                presentAddress: providerAddress || null,
                pincode: providerPincode || null,
                creditsDeducted: 1
            }).catch((e) => console.error(`Failed to save lookup history for ${result.rcNumber}: ${e.message}`))
        );

        const remainingCredits = user.credits - 1;

        return jsonResponse({
            success: true,
            data: result,
            cached: false,
            creditsDeducted: 1,
            remainingCredits
        });
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}
