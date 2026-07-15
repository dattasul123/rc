import {
    getUserById,
    deductCredit,
    saveLookupHistory,
    getPremiumThreshold
} from '../../utils/db.js';

const DEFAULT_IDSPAY_BASE_URL = 'https://javabackend.idspay.in/api/v1/prod';
const REQUIRED_IDSPAY_ENV = ['IDSPAY_API_ID', 'IDSPAY_API_KEY', 'IDSPAY_TOKEN_ID'];

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

// POST JSON to an IDSPay endpoint. Never throws: on a network or parse failure it
// returns ok:false so a failing enrichment call can't abort the whole lookup.
async function callIdsPay(url, body) {
    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const text = await resp.text();
        let json = {};
        try {
            json = text ? JSON.parse(text) : {};
        } catch {
            json = {};
        }
        return { ok: resp.ok, status: resp.status, json };
    } catch {
        return { ok: false, status: 0, json: {} };
    }
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
    // RC To Mobile v3 nests the resolved number at data.data.mobileNo.
    return findFieldValue(value, ['mobileno', 'mobilenumber', 'mobile']);
}

function readProviderName(value) {
    // RC Advance V2 uses `owner_name`; other endpoints use `owner` / `ownerName`.
    return findFieldValue(value, ['ownername', 'owner', 'name']);
}

// Normalize the free-text address for display: exactly one space after each comma
// and no double spaces. Providers return it comma-packed with no spaces.
function tidyAddress(address) {
    return String(address || '').replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();
}

function readProviderAddress(value) {
    // RC Advance V2 returns the full `present_address` (plus a structured
    // `split_present_address`); prefer present over permanent over address_line.
    return tidyAddress(findFieldValue(value, ['presentaddress', 'permanentaddress', 'addressline', 'address']));
}

// Prefer an explicit pincode field (RC Advance: split_present_address.pincode);
// fall back to the last 6-digit run in the address. May legitimately be empty.
function readProviderPincode(value, address = '') {
    const explicit = findFieldValue(value, ['pincode', 'pin']);
    if (explicit) {
        const digits = explicit.replace(/\D/g, '');
        if (digits.length === 6) return digits;
    }
    const matches = String(address).match(/\d{6}/g);
    return matches ? matches[matches.length - 1] : '';
}

export async function onRequestPost(context) {
    try {
        const { request, env, data } = context;
        const userId = data.user.id;
        const { rcNumber } = await request.json();
        // Canonicalize to bare alphanumerics (uppercase). Users type spaces/hyphens
        // ("HR 26 EZ 2802"); RC Advance V2 rejects those. Both IDSPay endpoints
        // accept the compact form.
        const vehicleNumber = String(rcNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

        if (!vehicleNumber) {
            return jsonResponse({ error: 'RC Number is required' }, 400);
        }

        if (vehicleNumber.length < 5) {
            return jsonResponse({ success: false, message: 'Invalid RC number format' }, 400);
        }

        // Global "premium" threshold set by admin: a user must have MORE than this
        // many credits to run a lookup. Applies to all users.
        const premiumThreshold = await getPremiumThreshold(env.DB);

        const user = await getUserById(env.DB, userId);
        if (!user || user.credits <= premiumThreshold) {
            const message = premiumThreshold > 0
                ? `A minimum balance above ${premiumThreshold} credits is required to run a lookup`
                : 'Insufficient credits';
            return jsonResponse({ error: message }, 403);
        }

        // Every lookup queries the provider live — there is no result cache.
        // (A shared cache previously served stale data from superseded endpoints.)

        const missingEnv = REQUIRED_IDSPAY_ENV.filter((key) => !env[key]);
        if (missingEnv.length > 0) {
            console.error(`IDSPay configuration missing: ${missingEnv.join(', ')}`);
            return jsonResponse({ success: false, message: 'RC lookup provider is not configured' }, 500);
        }

        // Two IDSPay endpoints are queried in parallel for the same RC:
        //   - RC To Mobile v3 (POST /srv1/rc-to-mobile)  -> mobile number (data.data.mobileNo)
        //   - RC Advance V2   (POST /srv2/validation/rc) -> owner name + full present address
        // The mobile is the essential deliverable (the lookup fails and charges
        // nothing without one); name/address are best-effort enrichment from RC Advance.
        const baseUrl = (env.IDSPAY_BASE_URL || DEFAULT_IDSPAY_BASE_URL).replace(/\/+$/, '');
        const creds = {
            api_id: env.IDSPAY_API_ID,
            api_key: env.IDSPAY_API_KEY,
            token_id: env.IDSPAY_TOKEN_ID
        };

        const [mobileCall, advanceCall] = await Promise.all([
            callIdsPay(`${baseUrl}/srv1/rc-to-mobile`, { ...creds, vehicle_num: vehicleNumber }),
            callIdsPay(`${baseUrl}/srv2/validation/rc`, { ...creds, reg_no: vehicleNumber })
        ]);

        // --- Mobile number (required) ---
        const mobileStatus = String(mobileCall?.json?.status?.type || '').trim().toLowerCase();
        const providerMobile = String(readProviderMobile(mobileCall?.json?.data)).trim();
        const providerMobileDigits = providerMobile.replace(/\D/g, '');
        const normalizedMobile = providerMobileDigits.length === 12 && providerMobileDigits.startsWith('91')
            ? providerMobileDigits.slice(2)
            : providerMobileDigits;

        if (!mobileCall?.ok || mobileStatus !== 'success') {
            const message = mobileCall?.json?.message || mobileCall?.json?.status?.message || 'RC to Mobile lookup failed';
            return jsonResponse({ success: false, message }, 502);
        }

        if (!providerMobile) {
            return jsonResponse({
                success: false,
                message: 'Provider reported success but did not return a mobile number'
            }, 502);
        }

        if (/[xX*]/.test(providerMobile) || !/^\d{10}$/.test(normalizedMobile)) {
            console.error('IDSPay returned a non-production or masked mobile number response');
            return jsonResponse({
                success: false,
                message: 'Provider returned masked/sample data. Confirm the production API credentials and endpoint are active.'
            }, 502);
        }

        // --- Owner name + address (best-effort, from RC Advance V2) ---
        const advanceData = advanceCall?.json?.data;
        const advanceOk = Boolean(advanceCall?.ok)
            && String(advanceCall?.json?.status?.type || '').trim().toLowerCase() === 'success';
        const providerName = advanceOk ? readProviderName(advanceData) : '';
        const providerAddress = advanceOk ? readProviderAddress(advanceData) : '';
        const providerPincode = advanceOk ? readProviderPincode(advanceData, providerAddress) : '';

        const result = {
            mobileNumber: normalizedMobile,
            ownerName: providerName || 'N/A',
            address: providerAddress || 'N/A',
            pincode: providerPincode || 'N/A',
            vehicleNumber,
            rcNumber: vehicleNumber
        };
        // --------------------------------------------------------------

        // Deduct credit (only after a successful lookup)
        const deducted = await deductCredit(env.DB, { userId, rcNumber: result.rcNumber });
        if (!deducted) {
            return jsonResponse({ error: 'Failed to deduct credit' }, 500);
        }

        // Save history
        await saveLookupHistory(env.DB, {
            userId,
            rcNumber: result.rcNumber,
            mobileNumber: result.mobileNumber,
            ownerName: result.ownerName,
            vehicleNumber: result.vehicleNumber,
            presentAddress: providerAddress || null,
            pincode: providerPincode || null,
            creditsDeducted: 1
        });

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
