import {
    getUserById,
    deductCredit,
    saveLookupHistory,
    getCachedRcLookup,
    saveRcToCache,
    incrementCacheHit,
    getPremiumThreshold
} from '../../utils/db.js';

// Serve a cached RC->mobile result if it was fetched within this many days.
const RC_CACHE_MAX_AGE_DAYS = 90;

const DEFAULT_IDSPAY_BASE_URL = 'https://javabackend.idspay.in/api/v1/prod';
const REQUIRED_IDSPAY_ENV = ['IDSPAY_API_ID', 'IDSPAY_API_KEY', 'IDSPAY_TOKEN_ID'];

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

function normalizeFieldName(key) {
    return String(key).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Recursively find the first non-empty scalar whose (normalized) key matches one
// of `candidateKeys`. Direct keys on the current object win over nested ones, so a
// top-level `present_address` is preferred to a nested `address_line`. Provider
// field names vary between endpoints, so we match on a small set of aliases.
function findFieldValue(value, candidateKeys, depth = 0) {
    if (!value || depth > 4) return '';

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findFieldValue(item, candidateKeys, depth + 1);
            if (found) return found;
        }
        return '';
    }

    if (typeof value !== 'object') return '';

    for (const [key, fieldValue] of Object.entries(value)) {
        if (candidateKeys.includes(normalizeFieldName(key)) && fieldValue && typeof fieldValue !== 'object') {
            return String(fieldValue).trim();
        }
    }

    for (const fieldValue of Object.values(value)) {
        const found = findFieldValue(fieldValue, candidateKeys, depth + 1);
        if (found) return found;
    }

    return '';
}

function readProviderMobile(value) {
    return findFieldValue(value, ['mobileno', 'mobilenumber', 'mobile']);
}

function readProviderName(value) {
    // RC Premium V2 uses `owner`; other endpoints use `owner_name` / `ownerName`.
    return findFieldValue(value, ['owner', 'ownername', 'name']);
}

function readProviderAddress(value) {
    return findFieldValue(value, ['presentaddress', 'addressline', 'permanentaddress', 'address']);
}

// Prefer an explicit pincode field; fall back to the last 6-digit run in the address.
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
        const vehicleNumber = String(rcNumber || '').trim().toUpperCase();

        if (!vehicleNumber) {
            return jsonResponse({ error: 'RC Number is required' }, 400);
        }

        if (vehicleNumber.length < 5) {
            return jsonResponse({ success: false, message: 'Invalid RC number format' }, 400);
        }

        // Global "premium" threshold set by admin: a user must have MORE than this
        // many credits to run a lookup (including free cache hits). Applies to all users.
        const premiumThreshold = await getPremiumThreshold(env.DB);

        const user = await getUserById(env.DB, userId);
        if (!user || user.credits <= premiumThreshold) {
            const message = premiumThreshold > 0
                ? `A minimum balance above ${premiumThreshold} credits is required to run a lookup`
                : 'Insufficient credits';
            return jsonResponse({ error: message }, 403);
        }

        // --- Shared cache: if any user already looked up this RC (and it's still
        //     fresh), serve it from our DB without calling the paid provider.
        //     Cache hits are free — no credit is deducted. ---
        const cached = await getCachedRcLookup(env.DB, vehicleNumber, RC_CACHE_MAX_AGE_DAYS);
        if (cached) {
            const result = {
                mobileNumber: cached.mobile_number,
                ownerName: cached.owner_name || 'N/A',
                address: cached.present_address || 'N/A',
                pincode: cached.pincode || 'N/A',
                vehicleNumber,
                rcNumber: vehicleNumber
            };

            await incrementCacheHit(env.DB, vehicleNumber);
            await saveLookupHistory(env.DB, {
                userId,
                rcNumber: result.rcNumber,
                mobileNumber: result.mobileNumber,
                ownerName: result.ownerName,
                vehicleNumber: result.vehicleNumber,
                presentAddress: cached.present_address || null,
                pincode: cached.pincode || null,
                creditsDeducted: 0
            });

            return jsonResponse({
                success: true,
                data: result,
                cached: true,
                creditsDeducted: 0,
                remainingCredits: user.credits
            });
        }
        // ---------------------------------------------------------------------

        const missingEnv = REQUIRED_IDSPAY_ENV.filter((key) => !env[key]);
        if (missingEnv.length > 0) {
            console.error(`IDSPay configuration missing: ${missingEnv.join(', ')}`);
            return jsonResponse({ success: false, message: 'RC lookup provider is not configured' }, 500);
        }

        // --- IDSPay "RC Premium V2" API (POST /Rc-Premium-v2-verify) ---
        //     Returns the full registration record (owner, address, mobile, …).
        //     Fields are double-nested at data.data.*; the resolved mobile is at
        //     data.mobileNo (inner data.mobileNumber is often null).
        const baseUrl = (env.IDSPAY_BASE_URL || DEFAULT_IDSPAY_BASE_URL).replace(/\/+$/, '');
        const apiResp = await fetch(`${baseUrl}/Rc-Premium-v2-verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_id: env.IDSPAY_API_ID,
                api_key: env.IDSPAY_API_KEY,
                token_id: env.IDSPAY_TOKEN_ID,
                vehicle_num: vehicleNumber
            })
        });

        const responseText = await apiResp.text();
        let apiJson = {};
        try {
            apiJson = responseText ? JSON.parse(responseText) : {};
        } catch {
            return jsonResponse({ success: false, message: 'RC lookup provider returned an invalid response' }, 502);
        }

        const providerStatus = String(apiJson?.status?.type || '').trim().toLowerCase();
        const providerData = apiJson?.data;
        const providerMobile = String(readProviderMobile(providerData)).trim();
        const providerMobileDigits = providerMobile.replace(/\D/g, '');
        const normalizedMobile = providerMobileDigits.length === 12 && providerMobileDigits.startsWith('91')
            ? providerMobileDigits.slice(2)
            : providerMobileDigits;

        const providerName = readProviderName(providerData);
        const providerAddress = readProviderAddress(providerData);
        const providerPincode = readProviderPincode(providerData, providerAddress);

        if (!apiResp.ok || providerStatus !== 'success') {
            const message = apiJson?.message || apiJson?.status?.message || 'RC details lookup failed';
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

        const result = {
            mobileNumber: normalizedMobile,
            ownerName: providerName || 'N/A',
            address: providerAddress || 'N/A',
            pincode: providerPincode || 'N/A',
            vehicleNumber,
            rcNumber: vehicleNumber
        };
        // --------------------------------------------------------------

        // Persist to the shared cache first, so this paid result is reusable by
        // any user even if the credit deduction below fails for this request.
        await saveRcToCache(env.DB, {
            rcNumber: result.rcNumber,
            mobileNumber: result.mobileNumber,
            ownerName: providerName || null,
            vehicleNumber: result.vehicleNumber,
            presentAddress: providerAddress || null,
            pincode: providerPincode || null
        });

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
