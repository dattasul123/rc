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

function readProviderMobile(value, depth = 0) {
    if (!value || depth > 4) return '';

    if (Array.isArray(value)) {
        for (const item of value) {
            const mobile = readProviderMobile(item, depth + 1);
            if (mobile) return mobile;
        }
        return '';
    }

    if (typeof value !== 'object') return '';

    for (const [key, fieldValue] of Object.entries(value)) {
        const normalizedKey = normalizeFieldName(key);
        if (['mobileno', 'mobilenumber', 'mobile'].includes(normalizedKey) && fieldValue) {
            return fieldValue;
        }
    }

    for (const fieldValue of Object.values(value)) {
        const mobile = readProviderMobile(fieldValue, depth + 1);
        if (mobile) return mobile;
    }

    return '';
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

        // --- IDSPay "RC To Mobile v3" API (POST /srv1/rc-to-mobile) ---
        const baseUrl = (env.IDSPAY_BASE_URL || DEFAULT_IDSPAY_BASE_URL).replace(/\/+$/, '');
        const apiResp = await fetch(`${baseUrl}/srv1/rc-to-mobile`, {
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
        const providerMobile = String(readProviderMobile(apiJson?.data)).trim();
        const providerMobileDigits = providerMobile.replace(/\D/g, '');
        const normalizedMobile = providerMobileDigits.length === 12 && providerMobileDigits.startsWith('91')
            ? providerMobileDigits.slice(2)
            : providerMobileDigits;

        if (!apiResp.ok || providerStatus !== 'success') {
            const message = apiJson?.message || apiJson?.status?.message || 'RC to Mobile lookup failed';
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
            ownerName: apiJson.data.ownerName || 'N/A', // Not returned by RC To Mobile v3
            vehicleNumber,
            rcNumber: vehicleNumber
        };
        // --------------------------------------------------------------

        // Persist to the shared cache first, so this paid result is reusable by
        // any user even if the credit deduction below fails for this request.
        await saveRcToCache(env.DB, {
            rcNumber: result.rcNumber,
            mobileNumber: result.mobileNumber,
            ownerName: result.ownerName === 'N/A' ? null : result.ownerName,
            vehicleNumber: result.vehicleNumber
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
