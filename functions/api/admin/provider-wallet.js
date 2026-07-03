const REQUIRED_IDSPAY_ENV = ['IDSPAY_API_ID', 'IDSPAY_API_KEY', 'IDSPAY_TOKEN_ID'];

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

function findBalanceValue(payload) {
    const candidates = [
        payload?.balance,
        payload?.credits,
        payload?.walletBalance,
        payload?.wallet_balance,
        payload?.availableBalance,
        payload?.available_balance,
        payload?.data?.balance,
        payload?.data?.credits,
        payload?.data?.walletBalance,
        payload?.data?.wallet_balance,
        payload?.data?.availableBalance,
        payload?.data?.available_balance
    ];

    return candidates.find((value) => value !== undefined && value !== null && value !== '');
}

export async function onRequestGet({ env }) {
    try {
        if (!env.IDSPAY_WALLET_BALANCE_URL) {
            return jsonResponse({
                configured: false,
                message: 'IDSPAY_WALLET_BALANCE_URL is not configured'
            }, 200);
        }

        const missingEnv = REQUIRED_IDSPAY_ENV.filter((key) => !env[key]);
        if (missingEnv.length > 0) {
            console.error(`IDSPay configuration missing: ${missingEnv.join(', ')}`);
            return jsonResponse({
                configured: false,
                message: 'IDSPay credentials are not fully configured'
            }, 500);
        }

        const method = (env.IDSPAY_WALLET_BALANCE_METHOD || 'POST').toUpperCase();
        const requestInit = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };

        if (method !== 'GET' && method !== 'HEAD') {
            requestInit.body = JSON.stringify({
                api_id: env.IDSPAY_API_ID,
                api_key: env.IDSPAY_API_KEY,
                token_id: env.IDSPAY_TOKEN_ID
            });
        }

        const providerResp = await fetch(env.IDSPAY_WALLET_BALANCE_URL, requestInit);
        const responseText = await providerResp.text();
        let providerJson = {};

        try {
            providerJson = responseText ? JSON.parse(responseText) : {};
        } catch {
            return jsonResponse({
                configured: true,
                available: false,
                message: 'IDSPay wallet endpoint returned an invalid response'
            }, 502);
        }

        if (!providerResp.ok || providerJson?.status?.type === 'error') {
            const message = providerJson?.message || providerJson?.status?.message || 'Unable to fetch IDSPay wallet balance';
            return jsonResponse({
                configured: true,
                available: false,
                message
            }, 502);
        }

        const balance = findBalanceValue(providerJson);

        if (balance === undefined) {
            return jsonResponse({
                configured: true,
                available: false,
                message: 'IDSPay wallet response did not include a recognizable balance field'
            }, 502);
        }

        return jsonResponse({
            configured: true,
            available: true,
            balance,
            fetchedAt: new Date().toISOString()
        });
    } catch (err) {
        return jsonResponse({ configured: true, available: false, message: err.message }, 500);
    }
}
