import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// Terms ladder for B2B deals. Rebased on the deals that actually close: the
// largest so far is 400 credits, so the gate is the size of the cheque, not a
// monthly call volume nobody in this market reaches.
const DEAL_TIERS = [
    { minPrice: 99, credits: 25, validity: '12 months', payment: 'Pay-as-you-go, invoiced on use' },
    { minPrice: 85, credits: 50, validity: '12 months', payment: 'Pay-as-you-go, invoiced monthly' },
    { minPrice: 75, credits: 100, validity: '6 months', payment: '100% prepaid' },
    { minPrice: 65, credits: 250, validity: '6 months', payment: '100% prepaid' },
    { minPrice: 55, credits: 400, validity: '90 days', payment: '100% prepaid' },
    { minPrice: 45, credits: 750, validity: '90 days', payment: '100% prepaid + auto-recharge mandate' },
    { minPrice: 0, credits: 1500, validity: '60 days, no rollover', payment: 'Annual prepaid only — escalate before agreeing' }
];

export default function AdminPanel() {
    const { logout, user: currentUser } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [creditAmount, setCreditAmount] = useState(10);
    const [creditAction, setCreditAction] = useState('add'); // 'add' | 'deduct'
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [activeTab, setActiveTab] = useState('users'); // 'users' | 'transactions' | 'calculator'
    // Deal calculator inputs. Defaults reproduce the largest deal closed so far:
    // 400 credits for Rs.25,000 (Rs.62.50/call).
    const [calcCredits, setCalcCredits] = useState(400);
    const [calcPrice, setCalcPrice] = useState(62.5);
    const [calcCost, setCalcCost] = useState(10);      // what IDSPay bills per API call
    const [calcDualCall, setCalcDualCall] = useState(true);  // we hit 2 endpoints per lookup
    const [calcUtilisation, setCalcUtilisation] = useState(70); // % of credits they actually burn
    const [calcSuccessRate, setCalcSuccessRate] = useState(85); // % of attempts that return a mobile
    const [providerWallet, setProviderWallet] = useState({
        configured: false,
        available: false,
        message: 'Loading...'
    });

    const emptyNewUser = { fullName: '', email: '', password: '', role: 'user', credits: 0 };
    const [newUser, setNewUser] = useState(emptyNewUser);
    const [isCreating, setIsCreating] = useState(false);
    const [createMessage, setCreateMessage] = useState({ type: '', text: '' });

    const [premiumThreshold, setPremiumThreshold] = useState(0);
    const [premiumInput, setPremiumInput] = useState('0');
    const [savingPremium, setSavingPremium] = useState(false);
    const [premiumMessage, setPremiumMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [usersRes, transRes, walletRes, settingsRes] = await Promise.all([
                fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }),
                fetch('/api/admin/transactions', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }),
                fetch('/api/admin/provider-wallet', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }),
                fetch('/api/admin/settings', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
            ]);

            if (usersRes.ok) setUsers((await usersRes.json()).users);
            if (transRes.ok) setTransactions((await transRes.json()).transactions);
            if (settingsRes.ok) {
                const s = await settingsRes.json();
                const threshold = s.premiumThreshold ?? 0;
                setPremiumThreshold(threshold);
                setPremiumInput(String(threshold));
            }
            if (walletRes.ok) {
                setProviderWallet(await walletRes.json());
            } else {
                const data = await walletRes.json().catch(() => ({}));
                setProviderWallet({
                    configured: true,
                    available: false,
                    message: data.message || data.error || 'Unable to fetch wallet balance'
                });
            }
        } catch (err) {
            console.error('Failed to fetch admin data', err);
            setProviderWallet({
                configured: true,
                available: false,
                message: 'Unable to fetch wallet balance'
            });
        }
    };

    // Shared caller for both the form and the inline +/- buttons.
    const submitAdjust = async ({ userId, amount, action, note }) => {
        const res = await fetch('/api/admin/adjust-credits', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ userId, amount, action, note })
        });
        const data = await res.json();
        return { ok: res.ok, data };
    };

    const handleAdjust = async (e) => {
        e.preventDefault();
        if (!selectedUserId || creditAmount <= 0) return;

        setIsLoading(true);
        setMessage({ type: '', text: '' });

        try {
            const { ok, data } = await submitAdjust({
                userId: selectedUserId,
                amount: parseInt(creditAmount, 10),
                action: creditAction
            });

            if (ok) {
                setMessage({ type: 'success', text: data.message });
                setCreditAmount(10);
                setSelectedUserId('');
                fetchData(); // Refresh data
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to update credits' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Network error' });
        } finally {
            setIsLoading(false);
        }
    };

    // Quick per-row adjustment. `action` is 'add' or 'deduct'.
    const handleInlineAdjust = async (u, action) => {
        const verb = action === 'deduct' ? 'remove from' : 'add to';
        const input = window.prompt(
            `How many credits to ${verb} ${u.full_name} (${u.email})?\nCurrent balance: ${u.credits}`,
            '1'
        );
        if (input == null) return; // cancelled

        const amount = parseInt(input, 10);
        if (!Number.isFinite(amount) || amount <= 0) {
            setMessage({ type: 'error', text: 'Enter a valid positive amount' });
            return;
        }

        setMessage({ type: '', text: '' });

        try {
            const { ok, data } = await submitAdjust({ userId: u.id, amount, action });
            if (ok) {
                setMessage({ type: 'success', text: data.message });
                fetchData();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to update credits' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Network error' });
        }
    };

    const handleSavePremium = async (e) => {
        e.preventDefault();
        setSavingPremium(true);
        setPremiumMessage({ type: '', text: '' });

        try {
            const res = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ premiumThreshold: parseInt(premiumInput, 10) })
            });

            const data = await res.json();

            if (res.ok) {
                setPremiumThreshold(data.premiumThreshold);
                setPremiumInput(String(data.premiumThreshold));
                setPremiumMessage({ type: 'success', text: data.message });
            } else {
                setPremiumMessage({ type: 'error', text: data.error || 'Failed to update threshold' });
            }
        } catch (err) {
            setPremiumMessage({ type: 'error', text: 'Network error' });
        } finally {
            setSavingPremium(false);
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setIsCreating(true);
        setCreateMessage({ type: '', text: '' });

        try {
            const res = await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    fullName: newUser.fullName,
                    email: newUser.email,
                    password: newUser.password,
                    role: newUser.role,
                    credits: parseInt(newUser.credits) || 0
                })
            });

            const data = await res.json();

            if (res.ok) {
                setCreateMessage({ type: 'success', text: data.message });
                setNewUser(emptyNewUser);
                fetchData(); // Refresh data
            } else {
                setCreateMessage({ type: 'error', text: data.error || 'Failed to create user' });
            }
        } catch (err) {
            setCreateMessage({ type: 'error', text: 'Network error' });
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteUser = async (u) => {
        if (!window.confirm(`Delete ${u.full_name} (${u.email})? This also removes their transactions and lookup history. This cannot be undone.`)) {
            return;
        }

        setMessage({ type: '', text: '' });

        try {
            const res = await fetch('/api/admin/delete-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ userId: u.id })
            });

            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: data.message });
                fetchData(); // Refresh data
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to delete user' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Network error' });
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // --- Deal economics -------------------------------------------------------
    // Our true cost per *billed* credit is not the raw provider rate: rc-lookup.js
    // fires two IDSPay endpoints per lookup, and only charges the client when a
    // mobile number comes back. Failed attempts cost us money and earn nothing.
    const LIST_PRICE = 99; // public rate card, the anchor we discount from
    const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

    const dealValue = calcCredits * calcPrice;
    const usedCredits = calcCredits * (calcUtilisation / 100);
    const unusedCredits = calcCredits - usedCredits;
    const callsPerLookup = calcDualCall ? 2 : 1;
    const attemptsPerCredit = calcSuccessRate > 0 ? 100 / calcSuccessRate : 0;
    const trueCostPerCredit = calcCost * callsPerLookup * attemptsPerCredit;
    const providerCost = usedCredits * trueCostPerCredit;
    const grossProfit = dealValue - providerCost;
    const marginPct = dealValue > 0 ? (grossProfit / dealValue) * 100 : 0;
    // Credits sold but never burnt are 100% margin -- the single biggest lever.
    const breakageProfit = unusedCredits * calcPrice;
    const realisedPerUsedCall = usedCredits > 0 ? dealValue / usedCredits : 0;
    const breakEvenPrice = calcCredits > 0 ? providerCost / calcCredits : 0;
    const discountPct = (1 - calcPrice / LIST_PRICE) * 100;

    const verdict = marginPct >= 70 ? { label: 'Strong — close it today', tone: 'green' }
        : marginPct >= 55 ? { label: 'Healthy — standard terms', tone: 'green' }
        : marginPct >= 40 ? { label: 'Thin — take concessions in exchange', tone: 'amber' }
        : marginPct >= 25 ? { label: 'Floor — full prepay only', tone: 'amber' }
        : { label: 'Loss-making — restructure or walk', tone: 'red' };

    // A free credit costs us trueCostPerCredit but reads as LIST_PRICE of value.
    // That leverage is why we always add credits instead of cutting the rate.
    const sweetenerCredits = Math.max(25, Math.round(calcCredits * 0.1 / 25) * 25);
    const sweetenerRealCost = sweetenerCredits * trueCostPerCredit;
    const sweetenerPerceived = sweetenerCredits * LIST_PRICE;
    // The like-for-like discount we would otherwise have conceded.
    const discountAlternativeCost = calcCredits * (calcPrice * 0.1);

    const tier = DEAL_TIERS.find((t) => calcPrice >= t.minPrice);
    const commitmentShortfall = calcCredits < tier.credits;

    return (
        <div className="min-h-screen p-3 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
            <header className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center bg-white/5 backdrop-blur-xl p-4 rounded-xl border border-white/10 shadow-lg">
                <div>
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="bg-indigo-600 text-xs px-2 py-1 rounded">ADMIN</span>
                        Admin Control Panel
                    </h1>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-sm text-slate-400 hover:text-white transition-colors">
                        Go to Dashboard
                    </button>
                    <button onClick={handleLogout} className="text-sm text-red-400 hover:text-red-300 transition-colors">
                        Logout
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className="lg:col-span-1 space-y-4 sm:space-y-6">
                    <div className="glass-panel p-5 sm:p-6">
                        <h2 className="text-lg font-semibold text-white mb-4">Create User</h2>
                        {createMessage.text && (
                            <div className={`p-3 rounded-lg mb-4 text-sm ${createMessage.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/50' : 'bg-red-500/10 text-red-400 border border-red-500/50'}`}>
                                {createMessage.text}
                            </div>
                        )}
                        <form onSubmit={handleCreateUser} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="John Doe"
                                    value={newUser.fullName}
                                    onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">User ID</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="e.g. a, john01, 1234"
                                    value={newUser.email}
                                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="At least 8 characters"
                                    value={newUser.password}
                                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                                    minLength={8}
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                                    <select
                                        className="input-field bg-slate-900"
                                        value={newUser.role}
                                        onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                                    >
                                        <option value="user">User</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Credits</label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="input-field"
                                        value={newUser.credits}
                                        onChange={(e) => setNewUser({ ...newUser, credits: e.target.value })}
                                    />
                                </div>
                            </div>
                            <button type="submit" className="btn-primary w-full" disabled={isCreating}>
                                {isCreating ? 'Creating...' : 'Create User'}
                            </button>
                        </form>
                    </div>

                    <div className="glass-panel p-5 sm:p-6">
                        <h2 className="text-lg font-semibold text-white mb-4">Adjust Credits</h2>
                        {message.text && (
                            <div className={`p-3 rounded-lg mb-4 text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/50' : 'bg-red-500/10 text-red-400 border border-red-500/50'}`}>
                                {message.text}
                            </div>
                        )}
                        <form onSubmit={handleAdjust} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Select User</label>
                                <select
                                    className="input-field bg-slate-900"
                                    value={selectedUserId}
                                    onChange={(e) => setSelectedUserId(e.target.value)}
                                    required
                                >
                                    <option value="" disabled>-- Select a user --</option>
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>{u.full_name} ({u.email}) - {u.credits} cr</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Action</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setCreditAction('add')}
                                        className={`py-2 rounded-lg text-sm font-medium border transition-colors ${creditAction === 'add' ? 'bg-green-500/20 text-green-300 border-green-500/50' : 'bg-white/5 text-slate-400 border-white/10 hover:text-slate-200'}`}
                                    >
                                        + Add
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCreditAction('deduct')}
                                        className={`py-2 rounded-lg text-sm font-medium border transition-colors ${creditAction === 'deduct' ? 'bg-red-500/20 text-red-300 border-red-500/50' : 'bg-white/5 text-slate-400 border-white/10 hover:text-slate-200'}`}
                                    >
                                        − Deduct
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Amount</label>
                                <input
                                    type="number"
                                    min="1"
                                    className="input-field"
                                    value={creditAmount}
                                    onChange={(e) => setCreditAmount(e.target.value)}
                                    required
                                />
                            </div>
                            <button type="submit" className="btn-primary w-full" disabled={isLoading}>
                                {isLoading ? 'Processing...' : creditAction === 'deduct' ? 'Deduct Credits' : 'Add Credits'}
                            </button>
                        </form>
                    </div>

                    <div className="glass-panel p-5 sm:p-6">
                        <h2 className="text-lg font-semibold text-white mb-1">Premium Threshold</h2>
                        <p className="text-xs text-slate-400 mb-4">
                            Global minimum balance. Users must have <span className="text-slate-200 font-medium">more than</span> this many credits to run a lookup. Applies to all users.
                        </p>
                        {premiumMessage.text && (
                            <div className={`p-3 rounded-lg mb-4 text-sm ${premiumMessage.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/50' : 'bg-red-500/10 text-red-400 border border-red-500/50'}`}>
                                {premiumMessage.text}
                            </div>
                        )}
                        <form onSubmit={handleSavePremium} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Minimum credits (premium)</label>
                                <input
                                    type="number"
                                    min="0"
                                    className="input-field"
                                    value={premiumInput}
                                    onChange={(e) => setPremiumInput(e.target.value)}
                                    required
                                />
                                <p className="text-xs text-slate-500 mt-1">Currently active: {premiumThreshold}</p>
                            </div>
                            <button type="submit" className="btn-primary w-full" disabled={savingPremium}>
                                {savingPremium ? 'Saving...' : 'Save Threshold'}
                            </button>
                        </form>
                    </div>

                    <div className="glass-panel p-5 sm:p-6">
                        <h2 className="text-lg font-semibold text-white mb-2">System Stats</h2>
                        <div className="space-y-3 mt-4">
                            <div className="flex justify-between items-center bg-white/5 border border-white/10 p-3 rounded-lg">
                                <span className="text-slate-400 text-sm">IDSPay Wallet</span>
                                <span className={`font-bold text-right ${providerWallet.available ? 'text-green-400' : 'text-amber-300'}`}>
                                    {providerWallet.available ? providerWallet.balance : 'Unavailable'}
                                </span>
                            </div>
                            {!providerWallet.available && (
                                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 p-3 rounded-lg text-xs leading-relaxed">
                                    {providerWallet.message || 'Wallet balance is not available'}
                                </div>
                            )}
                            <div className="flex justify-between items-center bg-white/5 border border-white/10 p-3 rounded-lg">
                                <span className="text-slate-400 text-sm">Total Users</span>
                                <span className="font-bold text-white">{users.length}</span>
                            </div>
                            <div className="flex justify-between items-center bg-white/5 border border-white/10 p-3 rounded-lg">
                                <span className="text-slate-400 text-sm">Total Transactions</span>
                                <span className="font-bold text-white">{transactions.length}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2">
                    <div className="glass-panel overflow-hidden h-[70vh] sm:h-[600px] flex flex-col">
                        <div className="flex border-b border-white/10">
                            <button 
                                className={`flex-1 py-4 text-sm font-medium text-center transition-colors ${activeTab === 'users' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-indigo-500/5' : 'text-slate-400 hover:text-slate-200'}`}
                                onClick={() => setActiveTab('users')}
                            >
                                User Directory
                            </button>
                            <button 
                                className={`flex-1 py-4 text-sm font-medium text-center transition-colors ${activeTab === 'transactions' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-indigo-500/5' : 'text-slate-400 hover:text-slate-200'}`}
                                onClick={() => setActiveTab('transactions')}
                            >
                                Transaction History
                            </button>
                            <button 
                                className={`flex-1 py-4 text-sm font-medium text-center transition-colors ${activeTab === 'calculator' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-indigo-500/5' : 'text-slate-400 hover:text-slate-200'}`}
                                onClick={() => setActiveTab('calculator')}
                            >
                                Deal Calculator
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-3 sm:p-4 custom-scrollbar">
                            {activeTab === 'users' ? (
                                <table className="w-full min-w-[520px] text-left text-sm">
                                    <thead className="text-slate-400 bg-slate-900/50 backdrop-blur-md border-b border-white/10">
                                        <tr>
                                            <th className="pb-3 px-4">Name / User ID</th>
                                            <th className="pb-3 px-4">Role</th>
                                            <th className="pb-3 px-4">Credits</th>
                                            <th className="pb-3 px-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map(u => (
                                            <tr key={u.id} className="border-b border-white/10 hover:bg-slate-700/20">
                                                <td className="py-3 px-4">
                                                    <div className="font-medium text-white">{u.full_name}</div>
                                                    <div className="text-slate-400 text-xs">{u.email}</div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className={`text-xs px-2 py-1 rounded-full ${u.role === 'admin' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-700 text-slate-300'}`}>
                                                        {u.role}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 font-semibold text-white">{u.credits}</td>
                                                <td className="py-3 px-4 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={() => handleInlineAdjust(u, 'add')}
                                                            title="Add credits"
                                                            className="text-sm font-bold text-green-400 hover:text-green-300 hover:bg-green-500/10 w-7 h-7 rounded transition-colors"
                                                        >
                                                            +
                                                        </button>
                                                        <button
                                                            onClick={() => handleInlineAdjust(u, 'deduct')}
                                                            title="Deduct credits"
                                                            className="text-sm font-bold text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 w-7 h-7 rounded transition-colors"
                                                        >
                                                            −
                                                        </button>
                                                        {currentUser && u.id === currentUser.id ? (
                                                            <span className="text-xs text-slate-500 pl-2">You</span>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleDeleteUser(u)}
                                                                className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1 rounded transition-colors"
                                                            >
                                                                Delete
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : activeTab === 'transactions' ? (
                                <table className="w-full min-w-[520px] text-left text-sm">
                                    <thead className="text-slate-400 bg-slate-900/50 backdrop-blur-md border-b border-white/10">
                                        <tr>
                                            <th className="pb-3 px-4">Type</th>
                                            <th className="pb-3 px-4">User</th>
                                            <th className="pb-3 px-4">Amount</th>
                                            <th className="pb-3 px-4">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.map(t => (
                                            <tr key={t.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                                                <td className="py-3 px-4">
                                                    <span className={`text-xs px-2 py-1 rounded font-medium ${t.type === 'credit' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                        {t.type.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-slate-300">{t.user_email}</td>
                                                <td className="py-3 px-4 font-bold text-white">{t.amount}</td>
                                                <td className="py-3 px-4">
                                                    <div className="text-slate-300">{t.description}</div>
                                                    {t.rc_number && <div className="text-xs text-indigo-400 mt-1">RC: {t.rc_number}</div>}
                                                    {t.admin_email && <div className="text-xs text-slate-500 mt-1">By: {t.admin_email}</div>}
                                                    <div className="text-xs text-slate-500 mt-1">{new Date(t.created_at).toLocaleString()}</div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : activeTab === 'calculator' ? (
                                <div className="p-2 sm:p-4 max-w-3xl mx-auto space-y-5">
                                    <div className="text-center mb-2">
                                        <h3 className="text-2xl font-bold text-white mb-2">B2B Deal Calculator</h3>
                                        <p className="text-slate-400 text-sm">Model the real margin on a deal before you agree to it, and see what to concede instead of cutting the rate.</p>
                                    </div>

                                    {/* --- What the client is asking for --- */}
                                    <div className="bg-slate-900/50 p-5 rounded-xl border border-white/10 space-y-5">
                                        <div>
                                            <div className="flex justify-between items-baseline mb-2">
                                                <label className="text-sm font-medium text-slate-300">Credits in the deal</label>
                                                <span className="text-lg font-bold text-white">{calcCredits.toLocaleString('en-IN')}</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="25" max="1000" step="25"
                                                value={calcCredits}
                                                onChange={(e) => setCalcCredits(Number(e.target.value))}
                                                className="w-full accent-indigo-500"
                                            />
                                        </div>

                                        <div>
                                            <div className="flex justify-between items-baseline mb-2">
                                                <label className="text-sm font-medium text-slate-300">Price per call</label>
                                                <span className="text-lg font-bold text-white">₹{calcPrice.toLocaleString('en-IN')}</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="30" max="120" step="2.5"
                                                value={calcPrice}
                                                onChange={(e) => setCalcPrice(Number(e.target.value))}
                                                className="w-full accent-indigo-500"
                                            />
                                            <p className="text-xs text-slate-500 mt-2">
                                                {discountPct > 0
                                                    ? `Sell this as ${Math.round(discountPct)}% off the ₹${LIST_PRICE} rate card — never quote it as a low price.`
                                                    : `At or above the ₹${LIST_PRICE} rate card. No discount language needed.`}
                                            </p>
                                        </div>

                                        <div className="flex items-baseline justify-between pt-3 border-t border-white/10">
                                            <span className="text-sm text-slate-400">Deal value</span>
                                            <span className="text-3xl font-bold text-indigo-400">{inr(dealValue)}</span>
                                        </div>
                                    </div>

                                    {/* --- Cost assumptions --- */}
                                    <div className="bg-slate-900/50 p-5 rounded-xl border border-white/10">
                                        <h4 className="text-sm font-semibold text-slate-300 mb-4">Your cost assumptions</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-xs text-slate-400 mb-1">IDSPay cost / API call (₹)</label>
                                                <input
                                                    type="number" min="0" step="0.5"
                                                    value={calcCost}
                                                    onChange={(e) => setCalcCost(Number(e.target.value))}
                                                    className="input-field text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-400 mb-1">Credits they'll actually use ({calcUtilisation}%)</label>
                                                <input
                                                    type="range" min="30" max="100" step="5"
                                                    value={calcUtilisation}
                                                    onChange={(e) => setCalcUtilisation(Number(e.target.value))}
                                                    className="w-full accent-green-500 mt-2"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-400 mb-1">Lookup success rate ({calcSuccessRate}%)</label>
                                                <input
                                                    type="range" min="50" max="100" step="5"
                                                    value={calcSuccessRate}
                                                    onChange={(e) => setCalcSuccessRate(Number(e.target.value))}
                                                    className="w-full accent-amber-500 mt-2"
                                                />
                                            </div>
                                        </div>

                                        <label className="flex items-start gap-3 mt-4 pt-4 border-t border-white/10 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={calcDualCall}
                                                onChange={(e) => setCalcDualCall(e.target.checked)}
                                                className="mt-1 accent-indigo-500"
                                            />
                                            <span className="text-xs text-slate-400">
                                                Two IDSPay endpoints are billed per lookup (RC To Mobile + RC Advance V2 run in parallel).
                                                Leave this on unless you make the RC Advance call conditional.
                                            </span>
                                        </label>

                                        <p className="text-xs text-slate-500 mt-3">
                                            True cost per delivered credit: <span className="text-white font-semibold">{inr(trueCostPerCredit)}</span>
                                            {' '}— {callsPerLookup} call{callsPerLookup > 1 ? 's' : ''} × ₹{calcCost}, divided by a {calcSuccessRate}% success rate.
                                            Failed lookups aren't charged to the client, so you absorb them.
                                        </p>
                                    </div>

                                    {/* --- The verdict --- */}
                                    <div className={`p-5 rounded-xl border ${
                                        verdict.tone === 'green' ? 'bg-green-500/10 border-green-500/40'
                                        : verdict.tone === 'amber' ? 'bg-amber-500/10 border-amber-500/40'
                                        : 'bg-red-500/10 border-red-500/40'}`}>
                                        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                                            <span className={`font-semibold ${
                                                verdict.tone === 'green' ? 'text-green-400'
                                                : verdict.tone === 'amber' ? 'text-amber-400'
                                                : 'text-red-400'}`}>{verdict.label}</span>
                                            <span className="text-4xl font-bold text-white">{marginPct.toFixed(0)}%</span>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                                            <div>
                                                <div className="text-lg font-bold text-white">{inr(grossProfit)}</div>
                                                <div className="text-xs text-slate-400 mt-1">Gross profit</div>
                                            </div>
                                            <div>
                                                <div className="text-lg font-bold text-white">{inr(providerCost)}</div>
                                                <div className="text-xs text-slate-400 mt-1">Provider cost</div>
                                            </div>
                                            <div>
                                                <div className="text-lg font-bold text-white">{inr(breakEvenPrice)}</div>
                                                <div className="text-xs text-slate-400 mt-1">Break-even / call</div>
                                            </div>
                                            <div>
                                                <div className="text-lg font-bold text-white">{inr(realisedPerUsedCall)}</div>
                                                <div className="text-xs text-slate-400 mt-1">Realised / used call</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* --- Breakage: the quiet profit centre --- */}
                                    <div className="bg-white/5 border border-green-500/30 p-5 rounded-xl">
                                        <h4 className="text-green-400 font-semibold mb-1">Unused credits — {inr(breakageProfit)} at 100% margin</h4>
                                        <p className="text-sm text-slate-300">
                                            At {calcUtilisation}% utilisation they burn {Math.round(usedCredits).toLocaleString('en-IN')} of {calcCredits.toLocaleString('en-IN')} credits.
                                            The remaining {Math.round(unusedCredits).toLocaleString('en-IN')} cost you nothing to deliver, so {inr(breakageProfit)} of this deal is pure profit
                                            — {dealValue > 0 ? Math.round((breakageProfit / dealValue) * 100) : 0}% of the contract value.
                                        </p>
                                        <p className="text-xs text-slate-400 mt-3">
                                            This is why you sell bundles, not usage. Always round the pack <span className="text-white">up</span> (offer 500, not the 400 they asked for)
                                            and keep an expiry date on it. A generous-sounding "{tier.validity} validity" still books the breakage.
                                        </p>
                                    </div>

                                    {/* --- Add credits, never cut the rate --- */}
                                    <div className="bg-white/5 border border-indigo-500/30 p-5 rounded-xl">
                                        <h4 className="text-indigo-400 font-semibold mb-3">If they push back, add credits — don't cut the rate</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                                                <div className="text-xs text-green-400 font-semibold mb-2">DO — gift {sweetenerCredits} free credits</div>
                                                <div className="text-sm text-slate-300">Sounds like <span className="text-white font-bold">{inr(sweetenerPerceived)}</span> of value at the ₹{LIST_PRICE} rate card.</div>
                                                <div className="text-sm text-slate-300 mt-1">Actually costs you <span className="text-white font-bold">{inr(sweetenerRealCost)}</span> — and only if they use them.</div>
                                            </div>
                                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                                                <div className="text-xs text-red-400 font-semibold mb-2">DON'T — drop the rate 10%</div>
                                                <div className="text-sm text-slate-300">Feels like a smaller gesture to them.</div>
                                                <div className="text-sm text-slate-300 mt-1">Costs you <span className="text-white font-bold">{inr(discountAlternativeCost)}</span> in cash, permanently — every renewal reprices off the lower number.</div>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-3">
                                            The rate is a ratchet: once you quote ₹{calcPrice}, you will never get back to ₹{LIST_PRICE} with this client. Free credits reset to zero next contract.
                                        </p>
                                    </div>

                                    {/* --- Terms to demand at this price --- */}
                                    <div className="bg-white/5 border border-amber-500/30 p-5 rounded-xl">
                                        <h4 className="text-amber-400 font-semibold mb-3">Terms to hold at ₹{calcPrice}/call</h4>
                                        {commitmentShortfall && (
                                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
                                                <p className="text-sm text-red-300">
                                                    They're committing to {calcCredits.toLocaleString('en-IN')} credits but ₹{calcPrice}/call requires at least{' '}
                                                    <span className="font-bold text-white">{tier.credits.toLocaleString('en-IN')}</span>.
                                                    Either raise the pack to {tier.credits.toLocaleString('en-IN')} ({inr(tier.credits * calcPrice)}) or move them up a price tier.
                                                </p>
                                            </div>
                                        )}
                                        <dl className="space-y-3 text-sm">
                                            <div className="flex flex-wrap justify-between gap-2">
                                                <dt className="text-slate-400">Minimum pack</dt>
                                                <dd className="text-white font-medium">{tier.credits.toLocaleString('en-IN')} credits ({inr(tier.credits * calcPrice)})</dd>
                                            </div>
                                            <div className="flex flex-wrap justify-between gap-2">
                                                <dt className="text-slate-400">Payment</dt>
                                                <dd className="text-white font-medium">{tier.payment}</dd>
                                            </div>
                                            <div className="flex flex-wrap justify-between gap-2">
                                                <dt className="text-slate-400">Credit validity</dt>
                                                <dd className="text-white font-medium">{tier.validity}</dd>
                                            </div>
                                        </dl>
                                        {calcPrice < 60 && (
                                            <ul className="list-disc list-inside text-sm text-slate-300 space-y-1 mt-4 pt-4 border-t border-white/10">
                                                <li>Rate limit 10 requests/minute — frame it as "fair-use protection".</li>
                                                <li>Email support only, 48h response. No phone, no WhatsApp group.</li>
                                                <li>No uptime SLA and no credit-back for provider downtime.</li>
                                            </ul>
                                        )}
                                    </div>

                                    {/* --- Free-to-give concessions --- */}
                                    <div className="bg-white/5 border border-white/10 p-5 rounded-xl">
                                        <h4 className="text-slate-200 font-semibold mb-1">Concessions that cost you nothing</h4>
                                        <p className="text-xs text-slate-400 mb-3">Spend these before you touch the price. Give one at a time, and ask for something back each time.</p>
                                        <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
                                            <li>Longer validity ({tier.validity} → double it) — breakage still lands, it just lands later.</li>
                                            <li>Rollover of unused credits, but only if they recharge before expiry.</li>
                                            <li>Priority WhatsApp support line — at this volume it's a few messages a week.</li>
                                            <li>Free onboarding call and a walkthrough of the dashboard.</li>
                                            <li>A pilot pack of 25 credits at the tier rate, deductible from the first real order.</li>
                                            <li>Locked pricing for 12 months — costs nothing today and blocks a renegotiation later.</li>
                                        </ul>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
