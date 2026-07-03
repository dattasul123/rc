import { getUserById, deductCredit, saveLookupHistory } from '../../utils/db.js';

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

        const user = await getUserById(env.DB, userId);
        if (!user || user.credits <= 0) {
            return jsonResponse({ error: 'Insufficient credits' }, 403);
        }

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
            vehicleNumber: result.vehicleNumber
        });

        const remainingCredits = user.credits - 1;

        return jsonResponse({
            success: true,
            data: result,
            creditsDeducted: 1,
            remainingCredits
        });
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}
