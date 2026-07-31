import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// Published rate card. Every discount is quoted against this, never invented on
// the spot — a number you can say out loud is worth more than a slider.
const LIST_PRICE = 99;

// Fixed plans to pitch from. Titanium reproduces the largest deal closed so far
// (400 credits / Rs.25,000) and is marked most popular because it is the easy
// yes; Black exists so Titanium is not the top of the ladder and the client has
// somewhere to be talked up to.
// Tailwind classes are written out in full — the scanner cannot see names built
// by string concatenation at runtime.
const PLANS = [
    {
        id: 'silver',
        name: 'Silver',
        credits: 100,
        price: 89,
        badge: null,
        blurb: 'For a team testing the water.',
        validity: '6 months',
        payment: '100% prepaid',
        perks: ['Owner name, address & pincode', 'Email support (48h)', 'Dashboard access'],
        card: 'bg-slate-500/5 border-slate-400/30',
        accent: 'text-slate-300',
        chip: 'bg-slate-400/20 text-slate-200',
        rule: 'border-slate-400/20'
    },
    {
        id: 'gold',
        name: 'Gold',
        credits: 250,
        price: 75,
        badge: null,
        blurb: 'The standard commercial pack.',
        validity: '6 months',
        payment: '100% prepaid',
        perks: ['Everything in Silver', 'Priority WhatsApp support', 'Locked pricing for 12 months'],
        card: 'bg-amber-500/5 border-amber-400/30',
        accent: 'text-amber-300',
        chip: 'bg-amber-400/20 text-amber-200',
        rule: 'border-amber-400/20'
    },
    {
        id: 'titanium',
        name: 'Titanium',
        credits: 400,
        price: 62.5,
        badge: 'MOST POPULAR',
        blurb: 'What most partners settle on.',
        validity: '90 days',
        payment: '100% prepaid',
        perks: ['Everything in Gold', 'Dedicated account contact', 'Free onboarding & walkthrough'],
        card: 'bg-indigo-500/10 border-indigo-400/60',
        accent: 'text-indigo-300',
        chip: 'bg-indigo-400/20 text-indigo-200',
        rule: 'border-indigo-400/20'
    },
    {
        id: 'black',
        name: 'Black',
        credits: 750,
        price: 55,
        badge: 'BEST VALUE',
        blurb: 'Best per-call rate we issue.',
        validity: '90 days',
        payment: '100% prepaid + auto-recharge',
        perks: ['Everything in Titanium', 'Rollover on timely recharge', 'First look at new data sources'],
        card: 'bg-emerald-500/5 border-emerald-400/40',
        accent: 'text-emerald-300',
        chip: 'bg-emerald-400/20 text-emerald-200',
        rule: 'border-emerald-400/20'
    }
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
    // Off by default and must stay that way: this tab gets turned around to face
    // a client, and nothing about cost or margin can be on screen when it does.
    const [showInternals, setShowInternals] = useState(false);
    const [calcCost, setCalcCost] = useState(10);      // what IDSPay bills per API call
    const [calcDualCall, setCalcDualCall] = useState(true);  // we hit 2 endpoints per lookup
    const [calcUtilisation, setCalcUtilisation] = useState(70); // % of credits they actually burn
    const [calcSuccessRate, setCalcSuccessRate] = useState(85); // % of attempts that return a mobile

    // Wallet exposure planner.
    const [walletGrant, setWalletGrant] = useState(400);   // credits about to be handed out
    const [walletOverride, setWalletOverride] = useState(''); // type the real balance if the API is stale/down
    const [walletBuffer, setWalletBuffer] = useState(20);  // % held back to cover IDSPay's reporting lag
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
    const inr = (n) => `\u20b9${Math.round(n).toLocaleString('en-IN')}`;

    const callsPerLookup = calcDualCall ? 2 : 1;
    const attemptsPerCredit = calcSuccessRate > 0 ? 100 / calcSuccessRate : 0;
    const trueCostPerCredit = calcCost * callsPerLookup * attemptsPerCredit;

    // Everything a plan is worth, precomputed once so the cards stay dumb.
    const planRows = PLANS.map((plan) => {
        // Round the goodwill gift to a whole 25-credit block, but never to zero —
        // 10% of the smallest plan rounds down to nothing.
        const gift = Math.max(25, Math.round(plan.credits * 0.1 / 25) * 25);
        const total = plan.credits * plan.price;
        const listTotal = plan.credits * LIST_PRICE;
        const usedCredits = plan.credits * (calcUtilisation / 100);
        const providerCost = usedCredits * trueCostPerCredit;
        const grossProfit = total - providerCost;
        return {
            ...plan,
            total,
            listTotal,
            savings: listTotal - total,
            discountPct: Math.round((1 - plan.price / LIST_PRICE) * 100),
            grossProfit,
            marginPct: total > 0 ? (grossProfit / total) * 100 : 0,
            // Credits sold but never burnt are 100% margin -- the biggest lever.
            breakageProfit: (plan.credits - usedCredits) * plan.price,
            // A free credit costs us trueCostPerCredit but reads as LIST_PRICE of
            // value. That leverage is why we add credits instead of cutting rate.
            sweetenerCredits: gift,
            sweetenerRealCost: gift * trueCostPerCredit,
            sweetenerPerceived: gift * LIST_PRICE,
            discountAlternativeCost: total * 0.1
        };
    });

    // --- Wallet exposure ------------------------------------------------------
    // Credits we have handed out but clients have not burnt yet are a claim on
    // the IDSPay wallet. Each unspent credit will eventually pull
    // (cost x endpoints / success rate) rupees out of it, so the question
    // "can I grant this many credits" is really "is the wallet deep enough to
    // honour everything already sold, plus this".
    const drainPerCredit = trueCostPerCredit;

    const liveBalance = Number(providerWallet.balance);
    const hasLiveBalance = providerWallet.available && Number.isFinite(liveBalance);
    const walletBalance = walletOverride.trim() !== ''
        ? Number(walletOverride)
        : (hasLiveBalance ? liveBalance : 0);
    const walletBalanceKnown = walletOverride.trim() !== '' || hasLiveBalance;

    // c -- credits sold but not yet availed, straight off the user directory.
    const outstandingCredits = users.reduce((sum, u) => sum + (Number(u.credits) || 0), 0);
    const grantCredits = Number(walletGrant) || 0;
    const bufferMultiplier = 1 + (Number(walletBuffer) || 0) / 100;

    const currentLiability = outstandingCredits * drainPerCredit;
    const afterGrantLiability = (outstandingCredits + grantCredits) * drainPerCredit;
    const requiredBalance = afterGrantLiability * bufferMultiplier;
    const topUpNeeded = Math.max(0, requiredBalance - walletBalance);
    const walletHeadroom = walletBalance - currentLiability;
    // How many more credits could be granted before the wallet stops covering it.
    const maxSafeGrant = drainPerCredit > 0
        ? Math.max(0, Math.floor(walletBalance / bufferMultiplier / drainPerCredit) - outstandingCredits)
        : 0;

    // SQLite stores CURRENT_TIMESTAMP as UTC without a zone marker; parsing it
    // raw makes the browser read it as local time and skews the window by +5:30.
    const parseUtc = (s) => new Date(`${String(s).replace(' ', 'T')}Z`);
    const burnWindowDays = 7;
    const windowStart = Date.now() - burnWindowDays * 86400000;
    const creditsBurntInWindow = transactions
        .filter((t) => t.type === 'debit' && parseUtc(t.created_at).getTime() >= windowStart)
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const creditsPerDay = creditsBurntInWindow / burnWindowDays;
    const runwayDays = creditsPerDay > 0 && drainPerCredit > 0
        ? walletBalance / drainPerCredit / creditsPerDay
        : null;

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
                    {/* Fixed height only from sm up. On a phone the panel grows with
                        its content so the page scrolls once, instead of trapping
                        four plan cards inside a 70vh box. */}
                    <div className="glass-panel overflow-hidden sm:h-[600px] flex flex-col">
                        {/* Tabs scroll rather than squeeze: flex-1 would shrink four
                            labels below their text width on a 375px screen. */}
                        <div className="flex border-b border-white/10 overflow-x-auto custom-scrollbar">
                            {[
                                { id: 'users', label: 'Users' },
                                { id: 'transactions', label: 'Transactions' },
                                { id: 'calculator', label: 'Plans' },
                                { id: 'wallet', label: 'Wallet' }
                            ].map((t) => (
                                <button
                                    key={t.id}
                                    className={`flex-1 shrink-0 py-4 px-4 text-sm font-medium text-center whitespace-nowrap transition-colors ${activeTab === t.id ? 'text-indigo-400 border-b-2 border-indigo-400 bg-indigo-500/5' : 'text-slate-400 hover:text-slate-200'}`}
                                    onClick={() => setActiveTab(t.id)}
                                >
                                    {t.label}
                                </button>
                            ))}
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
                                <div className="p-2 sm:p-4 space-y-6">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <h3 className="text-2xl font-bold text-white">Plans</h3>
                                            <p className="text-slate-400 text-sm mt-1">
                                                All rates below our published ₹{LIST_PRICE}/call rate card.
                                            </p>
                                        </div>
                                        {/* Deliberately unlabelled in client terms and off on every load. */}
                                        <button
                                            onClick={() => setShowInternals(!showInternals)}
                                            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
                                                showInternals
                                                    ? 'bg-red-500/20 border-red-500/50 text-red-300'
                                                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                                            }`}
                                        >
                                            {showInternals ? '● Margin view ON — hide before sharing screen' : 'Margin view'}
                                        </button>
                                    </div>

                                    {/* ---------- The pitch: four fixed cards ---------- */}
                                    {/* Two-up max: the panel is only ~750px wide even on a
                                        large screen, so four columns would crush the price.
                                        pt-3 keeps the discount pill off the scroll edge. */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 gap-y-6 pt-3">
                                        {planRows.map((p) => (
                                            <div key={p.id} className="relative flex">
                                                {/* Discount sits above the card, as the headline number. */}
                                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                                                    <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${p.chip}`}>
                                                        {p.discountPct}% OFF
                                                    </span>
                                                </div>

                                                <div className={`flex flex-col w-full pt-7 pb-5 px-5 rounded-2xl border ${p.card} ${
                                                    p.badge === 'MOST POPULAR' ? 'ring-2 ring-indigo-400/40' : ''
                                                }`}>
                                                    {p.badge && (
                                                        <div className={`text-[10px] font-bold tracking-widest mb-2 ${p.accent}`}>
                                                            {p.badge}
                                                        </div>
                                                    )}

                                                    <h4 className={`text-xl font-bold ${p.accent}`}>{p.name}</h4>
                                                    <p className="text-xs text-slate-400 mt-1 min-h-[2rem]">{p.blurb}</p>

                                                    <div className={`mt-4 pt-4 border-t ${p.rule}`}>
                                                        <div className="flex items-baseline gap-1">
                                                            <span className="text-3xl font-bold text-white">₹{p.price}</span>
                                                            <span className="text-sm text-slate-400">/ call</span>
                                                        </div>
                                                        <div className="text-sm text-slate-500 line-through mt-1">₹{LIST_PRICE} / call</div>
                                                    </div>

                                                    <div className={`mt-4 pt-4 border-t ${p.rule}`}>
                                                        <div className="text-2xl font-bold text-white">{inr(p.total)}</div>
                                                        <div className="text-xs text-slate-400 mt-1">
                                                            {p.credits.toLocaleString('en-IN')} lookups, paid upfront
                                                        </div>
                                                        <div className={`text-sm font-semibold mt-2 ${p.accent}`}>
                                                            You save {inr(p.savings)}
                                                        </div>
                                                    </div>

                                                    <ul className="mt-4 space-y-2 text-xs text-slate-300 flex-1">
                                                        {p.perks.map((perk) => (
                                                            <li key={perk} className="flex gap-2">
                                                                <span className={p.accent}>✓</span>
                                                                <span>{perk}</span>
                                                            </li>
                                                        ))}
                                                    </ul>

                                                    <div className={`mt-4 pt-3 border-t ${p.rule} text-xs text-slate-400 space-y-1`}>
                                                        <div>Valid {p.validity}</div>
                                                        <div>{p.payment}</div>
                                                    </div>

                                                    {showInternals && (
                                                        <div className="mt-3 pt-3 border-t border-red-500/30 text-xs space-y-1">
                                                            <div className="flex justify-between">
                                                                <span className="text-slate-500">Margin</span>
                                                                <span className="text-white font-semibold">{p.marginPct.toFixed(0)}%</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-slate-500">Profit</span>
                                                                <span className="text-white font-semibold">{inr(p.grossProfit)}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-slate-500">Breakage</span>
                                                                <span className="text-white font-semibold">{inr(p.breakageProfit)}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <p className="text-xs text-slate-500 text-center">
                                        Pilot available: 25 lookups at ₹{LIST_PRICE}/call, deductible from the first plan they buy.
                                    </p>

                                    {/* ---------- Everything below is for you only ---------- */}
                                    {showInternals && (
                                        <div className="space-y-4 pt-2">
                                            <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-3">
                                                <p className="text-xs text-red-300">
                                                    Internal only — cost, margin and negotiation notes. Turn this off before you show anyone this screen.
                                                </p>
                                            </div>

                                            <div className="bg-slate-900/50 p-5 rounded-xl border border-white/10">
                                                <h4 className="text-sm font-semibold text-slate-300 mb-4">Cost assumptions</h4>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                                    <div>
                                                        <label className="block text-xs text-slate-400 mb-1">IDSPay ₹/call</label>
                                                        <input
                                                            type="number" min="0" step="0.5"
                                                            value={calcCost}
                                                            onChange={(e) => setCalcCost(Number(e.target.value))}
                                                            className="input-field text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-slate-400 mb-1">Utilisation %</label>
                                                        <input
                                                            type="number" min="1" max="100" step="5"
                                                            value={calcUtilisation}
                                                            onChange={(e) => setCalcUtilisation(Number(e.target.value))}
                                                            className="input-field text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-slate-400 mb-1">Success rate %</label>
                                                        <input
                                                            type="number" min="1" max="100" step="5"
                                                            value={calcSuccessRate}
                                                            onChange={(e) => setCalcSuccessRate(Number(e.target.value))}
                                                            className="input-field text-sm"
                                                        />
                                                    </div>
                                                    <div className="flex items-end">
                                                        <label className="flex items-center gap-2 cursor-pointer pb-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={calcDualCall}
                                                                onChange={(e) => setCalcDualCall(e.target.checked)}
                                                                className="accent-indigo-500"
                                                            />
                                                            <span className="text-xs text-slate-400">2 endpoints billed</span>
                                                        </label>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-3">
                                                    True cost per delivered credit: <span className="text-white font-semibold">{inr(trueCostPerCredit)}</span>
                                                    {' '}— {callsPerLookup} call{callsPerLookup > 1 ? 's' : ''} × ₹{calcCost}, ÷ {calcSuccessRate}% success.
                                                    Failed lookups aren't charged to the client, so you absorb them.
                                                </p>
                                            </div>

                                            <div className="bg-white/5 border border-indigo-500/30 p-5 rounded-xl">
                                                <h4 className="text-indigo-400 font-semibold mb-3">If they push back — add credits, never cut the rate</h4>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm min-w-[480px]">
                                                        <thead className="text-slate-400 text-xs">
                                                            <tr className="border-b border-white/10">
                                                                <th className="text-left pb-2">Plan</th>
                                                                <th className="text-right pb-2">Gift credits</th>
                                                                <th className="text-right pb-2">Sounds like</th>
                                                                <th className="text-right pb-2">Really costs</th>
                                                                <th className="text-right pb-2">vs 10% off</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {planRows.map((p) => (
                                                                <tr key={p.id} className="border-b border-white/5">
                                                                    <td className={`py-2 font-medium ${p.accent}`}>{p.name}</td>
                                                                    <td className="py-2 text-right text-white">{p.sweetenerCredits}</td>
                                                                    <td className="py-2 text-right text-green-400">{inr(p.sweetenerPerceived)}</td>
                                                                    <td className="py-2 text-right text-white">{inr(p.sweetenerRealCost)}</td>
                                                                    <td className="py-2 text-right text-red-400">{inr(p.discountAlternativeCost)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <p className="text-xs text-slate-400 mt-3">
                                                    The rate is a ratchet — once quoted, you never get back up with that client. Gifted credits reset to zero next contract.
                                                </p>
                                            </div>

                                            <div className="bg-white/5 border border-white/10 p-5 rounded-xl">
                                                <h4 className="text-slate-200 font-semibold mb-1">Free to give, in this order</h4>
                                                <p className="text-xs text-slate-400 mb-3">Spend these before touching price. One at a time, and ask for something back each time.</p>
                                                <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
                                                    <li>Double the validity — breakage still lands, it just lands later.</li>
                                                    <li>Rollover of unused credits, but only if they recharge before expiry.</li>
                                                    <li>Priority WhatsApp line — a few messages a week at this volume.</li>
                                                    <li>Free onboarding call and dashboard walkthrough.</li>
                                                    <li>25-credit pilot at rate card, deductible from their first plan.</li>
                                                    <li>12-month price lock — costs nothing today, blocks a renegotiation later.</li>
                                                </ul>
                                            </div>

                                            <div className="bg-white/5 border border-amber-500/30 p-5 rounded-xl">
                                                <h4 className="text-amber-400 font-semibold mb-2">Floor</h4>
                                                <p className="text-sm text-slate-300">
                                                    Below ₹55/call you are past the published ladder. Anything lower needs 750+ credits prepaid,
                                                    a 10 req/min rate limit framed as fair-use, email-only support and no SLA — or you walk.
                                                    Never discount and extend validity in the same breath.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : activeTab === 'wallet' ? (
                                <div className="p-2 sm:p-4 space-y-5">
                                    <div>
                                        <h3 className="text-2xl font-bold text-white">Wallet exposure</h3>
                                        <p className="text-slate-400 text-sm mt-1">
                                            Credits you've handed out are a claim on the IDSPay wallet. This says whether it's deep enough to honour them.
                                        </p>
                                    </div>

                                    {/* --- a, b, c --- */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="bg-slate-900/50 p-4 rounded-xl border border-white/10">
                                            <div className="flex items-baseline justify-between mb-2">
                                                <label className="text-xs font-semibold text-slate-300">a · Wallet balance</label>
                                                {hasLiveBalance && walletOverride.trim() === '' && (
                                                    <span className="text-[10px] text-green-400">LIVE</span>
                                                )}
                                            </div>
                                            <input
                                                type="number" min="0" step="100"
                                                value={walletOverride}
                                                placeholder={hasLiveBalance ? String(liveBalance) : 'enter balance'}
                                                onChange={(e) => setWalletOverride(e.target.value)}
                                                className="input-field text-sm"
                                            />
                                            <p className="text-[11px] text-slate-500 mt-2">
                                                {hasLiveBalance
                                                    ? 'Live from IDSPay, but it lags ~1h. Type the real figure to override.'
                                                    : 'IDSPay balance unavailable — type it in.'}
                                            </p>
                                        </div>

                                        <div className="bg-slate-900/50 p-4 rounded-xl border border-white/10">
                                            <label className="block text-xs font-semibold text-slate-300 mb-2">b · Cost per API call (₹)</label>
                                            <input
                                                type="number" min="0" step="0.5"
                                                value={calcCost}
                                                onChange={(e) => setCalcCost(Number(e.target.value))}
                                                className="input-field text-sm"
                                            />
                                            <label className="flex items-center gap-2 mt-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={calcDualCall}
                                                    onChange={(e) => setCalcDualCall(e.target.checked)}
                                                    className="accent-indigo-500"
                                                />
                                                <span className="text-[11px] text-slate-400">2 endpoints per lookup</span>
                                            </label>
                                        </div>

                                        <div className="bg-slate-900/50 p-4 rounded-xl border border-white/10">
                                            <label className="block text-xs font-semibold text-slate-300 mb-2">c · Credits un-availed</label>
                                            <div className="text-2xl font-bold text-white">{outstandingCredits.toLocaleString('en-IN')}</div>
                                            <p className="text-[11px] text-slate-500 mt-2">
                                                Live sum across all {users.length} users. Every one of these will eventually pull money out.
                                            </p>
                                        </div>
                                    </div>

                                    {/* --- drain rate --- */}
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                                            <span className="text-sm text-slate-400">Each credit drains</span>
                                            <span className="text-2xl font-bold text-white">{inr(drainPerCredit)}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-2">
                                            ₹{calcCost} × {callsPerLookup} endpoint{callsPerLookup > 1 ? 's' : ''} ÷ {calcSuccessRate}% success rate.
                                            Failed lookups still hit the wallet but earn you nothing, so they're priced in here.
                                        </p>
                                    </div>

                                    {/* --- the question they actually ask --- */}
                                    <div className="bg-slate-900/50 p-5 rounded-xl border border-white/10">
                                        <h4 className="text-sm font-semibold text-slate-300 mb-3">If I grant this many credits…</h4>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs text-slate-400 mb-1">Credits to grant</label>
                                                <input
                                                    type="number" min="0" step="25"
                                                    value={walletGrant}
                                                    onChange={(e) => setWalletGrant(Number(e.target.value))}
                                                    className="input-field text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-400 mb-1">Lag buffer %</label>
                                                <input
                                                    type="number" min="0" max="100" step="5"
                                                    value={walletBuffer}
                                                    onChange={(e) => setWalletBuffer(Number(e.target.value))}
                                                    className="input-field text-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* --- verdict --- */}
                                    {!walletBalanceKnown ? (
                                        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-5">
                                            <h4 className="text-amber-400 font-semibold">Enter the wallet balance</h4>
                                            <p className="text-sm text-slate-300 mt-1">
                                                Without <span className="font-semibold">a</span> there's nothing to compare the {inr(afterGrantLiability)} of
                                                commitments against.
                                            </p>
                                        </div>
                                    ) : topUpNeeded > 0 ? (
                                        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-5">
                                            <h4 className="text-red-400 font-semibold mb-1">Top up before granting</h4>
                                            <div className="text-3xl sm:text-4xl font-bold text-white my-2 break-words">{inr(topUpNeeded)}</div>
                                            <p className="text-sm text-slate-300">
                                                Granting {grantCredits.toLocaleString('en-IN')} takes commitments to {(outstandingCredits + grantCredits).toLocaleString('en-IN')} credits
                                                = {inr(afterGrantLiability)} of provider spend. With a {walletBuffer}% lag buffer you need {inr(requiredBalance)} in the wallet
                                                and you have {inr(walletBalance)}.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="bg-green-500/10 border border-green-500/40 rounded-xl p-5">
                                            <h4 className="text-green-400 font-semibold mb-1">Safe to grant</h4>
                                            <div className="my-2">
                                                <span className="text-3xl sm:text-4xl font-bold text-white break-words">{inr(walletBalance - requiredBalance)}</span>
                                                <span className="text-lg text-slate-300 ml-2">spare</span>
                                            </div>
                                            <p className="text-sm text-slate-300">
                                                After granting {grantCredits.toLocaleString('en-IN')} you'd owe {inr(afterGrantLiability)} of provider spend.
                                                With the {walletBuffer}% buffer that needs {inr(requiredBalance)} — the wallet holds {inr(walletBalance)}.
                                            </p>
                                        </div>
                                    )}

                                    {/* --- supporting numbers --- */}
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                            <div className="text-lg font-bold text-white">{inr(currentLiability)}</div>
                                            <div className="text-xs text-slate-400 mt-1">Owed on existing credits</div>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                            <div className={`text-lg font-bold ${walletHeadroom < 0 ? 'text-red-400' : 'text-white'}`}>
                                                {inr(walletHeadroom)}
                                            </div>
                                            <div className="text-xs text-slate-400 mt-1">Headroom today</div>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                            <div className="text-lg font-bold text-white">{maxSafeGrant.toLocaleString('en-IN')}</div>
                                            <div className="text-xs text-slate-400 mt-1">Max credits grantable now</div>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                            <div className="text-lg font-bold text-white">
                                                {runwayDays === null ? '—' : `${runwayDays.toFixed(0)}d`}
                                            </div>
                                            <div className="text-xs text-slate-400 mt-1">
                                                {runwayDays === null ? 'No burn in 7d' : `Runway at ${creditsPerDay.toFixed(1)} credits/day`}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white/5 border border-amber-500/30 rounded-xl p-4">
                                        <h4 className="text-amber-400 font-semibold text-sm mb-1">Why the buffer matters</h4>
                                        <p className="text-xs text-slate-300">
                                            IDSPay only reflects spend after about an hour, so the balance above is a best case — lookups running right now
                                            aren't in it yet. The {walletBuffer}% buffer is what stops a client's burst from bouncing against an empty wallet
                                            while the dashboard still shows funds. Grant credits against the buffered figure, never the raw one.
                                        </p>
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
