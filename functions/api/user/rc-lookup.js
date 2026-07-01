import { getUserById, deductCredit, saveLookupHistory } from '../../utils/db.js';

export async function onRequestPost(context) {
    try {
        const { request, env, data } = context;
        const userId = data.user.id;
        const { rcNumber } = await request.json();

        if (!rcNumber) {
            return new Response(JSON.stringify({ error: 'RC Number is required' }), { status: 400 });
        }

        const user = await getUserById(env.DB, userId);
        if (!user || user.credits <= 0) {
            return new Response(JSON.stringify({ error: 'Insufficient credits' }), { status: 403 });
        }

        // --- Mocking 3rd Party RC API ---
        // Simulating network delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Mock response data
        const mockData = {
            mobileNumber: '9' + Math.floor(Math.random() * 1000000000).toString().padStart(9, '0'), // Random 10 digit number starting with 9
            ownerName: 'Mock Owner ' + rcNumber.slice(-4),
            vehicleNumber: rcNumber.toUpperCase(),
            rcNumber: rcNumber.toUpperCase()
        };

        // If the API call fails or is invalid, we would return here.
        if (rcNumber.length < 5) {
             return new Response(JSON.stringify({ success: false, message: 'Invalid RC number format' }), { status: 400 });
        }
        // --------------------------------

        // Deduct credit
        const deducted = await deductCredit(env.DB, { userId, rcNumber: mockData.rcNumber });
        if (!deducted) {
             return new Response(JSON.stringify({ error: 'Failed to deduct credit' }), { status: 500 });
        }

        // Save history
        await saveLookupHistory(env.DB, {
            userId,
            rcNumber: mockData.rcNumber,
            mobileNumber: mockData.mobileNumber,
            ownerName: mockData.ownerName,
            vehicleNumber: mockData.vehicleNumber
        });

        const remainingCredits = user.credits - 1;

        return new Response(JSON.stringify({
            success: true,
            data: mockData,
            creditsDeducted: 1,
            remainingCredits
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
