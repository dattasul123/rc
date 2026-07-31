import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// Published rate card. Every discount is quoted against this, never invented on
// the spot — a number you can say out loud is worth more than a slider.
const LIST_PRICE = 99;

// What the market charges. The premium end is safe to quote at a client — it
// makes our rate look like a favour. The budget end is NOT: naming a cheaper
// supplier out loud hands the client a reason to go shopping. It stays behind
// the margin toggle, together with how to answer when they raise it themselves.
const RIVAL_PREMIUM = { price: 120, has: 'LinkedIn + RC' };
const RIVAL_BUDGET = { price: 30, has: 'RC only, no support after purchase' };

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
    // One credit buys the whole result — mobile number from RC To Mobile plus
    // owner name and address from RC Advance V2. Both API calls together are what
    // IDSPay bills us for, so this is the all-in cost of one credit, not per call.
    const [calcCost, setCalcCost] = useState(8.26);
    const [calcUtilisation, setCalcUtilisation] = useState(70); // % of credits they actually burn
    const [calcSuccessRate, setCalcSuccessRate] = useState(85); // % of attempts that return a mobile

    // Wallet exposure.
    const [walletOverride, setWalletOverride] = useState(''); // type the real balance if the API is stale/down
    const [walletBuffer, setWalletBuffer] = useState(20);  // % held back to cover IDSPay's reporting lag
    // Set only after credits are actually handed to someone, so the recharge
    // warning describes a real grant rather than a hypothetical one.
    const [grantAlert, setGrantAlert] = useState(null); // { credits, userName }
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
                const target = users.find((u) => String(u.id) === String(selectedUserId));
                const granted = creditAction === 'add' ? parseInt(creditAmount, 10) : 0;
                const grantedTo = target ? target.full_name : 'user';
                setCreditAmount(10);
                setSelectedUserId('');
                // Refresh before raising the banner — it quotes live outstanding
                // totals, which would be pre-grant figures for a frame otherwise.
                await fetchData();
                if (granted > 0) setGrantAlert({ credits: granted, userName: grantedTo });
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
                await fetchData();
                if (action === 'add') setGrantAlert({ credits: amount, userName: u.full_name });
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

    // The only markup on the sticker cost is failed attempts: a lookup that comes
    // back without a mobile is never charged to the client (rc-lookup.js only
    // deducts after success), but IDSPay was still queried. Set the success rate
    // to 100 if IDSPay doesn't bill those.
    const attemptsPerCredit = calcSuccessRate > 0 ? 100 / calcSuccessRate : 0;
    const trueCostPerCredit = calcCost * attemptsPerCredit;

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
    const bufferMultiplier = 1 + (Number(walletBuffer) || 0) / 100;

    // Everything below describes credits that genuinely exist, not a forecast:
    // outstandingCredits is the live sum from the user directory, so after a
    // grant lands and the directory refetches, these already include it.
    const currentLiability = outstandingCredits * drainPerCredit;
    const requiredBalance = currentLiability * bufferMultiplier;
    const topUpNeeded = Math.max(0, requiredBalance - walletBalance);
    const walletHeadroom = walletBalance - currentLiability;

    // The same exposure read back in credits: how many of the credits already
    // handed out can the wallet actually serve before it runs dry?
    const creditsCovered = drainPerCredit > 0
        ? Math.floor(walletBalance / bufferMultiplier / drainPerCredit)
        : 0;
    const creditsHonourable = Math.min(creditsCovered, outstandingCredits);
    const creditsUncovered = Math.max(0, outstandingCredits - creditsCovered);
    const coveragePct = outstandingCredits > 0
        ? Math.min(100, (creditsHonourable / outstandingCredits) * 100)
        : 100;
    const fullyCovered = creditsUncovered === 0;

    // Funding every outstanding credit assumes all of them get burnt. Historically
    // they don't, so this is the figure to actually plan cash around.
    const expectedBurnCredits = outstandingCredits * (calcUtilisation / 100);
    const expectedRequired = expectedBurnCredits * drainPerCredit * bufferMultiplier;
    const expectedTopUp = Math.max(0, expectedRequired - walletBalance);

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

            {/* Raised only after credits actually change hands. By the time this
                renders the user directory has refetched, so outstandingCredits
                and the figures below already include the grant. */}
            {grantAlert && (
                <div className={`rounded-xl border p-4 sm:p-5 ${
                    !walletBalanceKnown || topUpNeeded > 0
                        ? 'bg-red-500/10 border-red-500/50'
                        : 'bg-green-500/10 border-green-500/50'
                }`}>
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h3 className={`font-semibold ${
                                !walletBalanceKnown || topUpNeeded > 0 ? 'text-red-400' : 'text-green-400'
                            }`}>
                                {!walletBalanceKnown
                                    ? 'Check the IDSPay wallet'
                                    : topUpNeeded > 0
                                        ? 'Recharge IDSPay now'
                                        : 'Wallet still covers it'}
                            </h3>
                            <p className="text-sm text-slate-300 mt-1">
                                Gave <span className="font-semibold text-white">{grantAlert.credits.toLocaleString('en-IN')} credits</span> to {grantAlert.userName}
                                {' '}— that alone commits <span className="font-semibold text-white">{inr(grantAlert.credits * drainPerCredit)}</span> of IDSPay spend.
                            </p>

                            {!walletBalanceKnown ? (
                                <p className="text-sm text-slate-300 mt-2">
                                    {outstandingCredits.toLocaleString('en-IN')} credits are now outstanding across all users, worth {inr(currentLiability)} of
                                    provider spend. The wallet balance isn't available, so open the Wallet tab and enter it to see what's needed.
                                </p>
                            ) : topUpNeeded > 0 ? (
                                <>
                                    <div className="text-2xl sm:text-3xl font-bold text-white my-2 break-words">
                                        Recharge {inr(topUpNeeded)}
                                    </div>
                                    <p className="text-sm text-slate-300">
                                        {outstandingCredits.toLocaleString('en-IN')} credits outstanding = {inr(currentLiability)} of spend.
                                        With the {walletBuffer}% lag buffer the wallet needs {inr(requiredBalance)} and holds {inr(walletBalance)}.
                                    </p>
                                </>
                            ) : (
                                <p className="text-sm text-slate-300 mt-2">
                                    {outstandingCredits.toLocaleString('en-IN')} credits outstanding = {inr(currentLiability)} of spend.
                                    The wallet holds {inr(walletBalance)}, leaving {inr(walletBalance - requiredBalance)} spare after the {walletBuffer}% buffer.
                                </p>
                            )}
                        </div>
                        <button
                            onClick={() => setGrantAlert(null)}
                            className="text-slate-400 hover:text-white text-xl leading-none shrink-0"
                            aria-label="Dismiss"
                        >
                            ×
                        </button>
                    </div>
                </div>
            )}

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

                                    {/* Client-safe anchor: the premium rival only. */}
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                                        <p className="text-sm text-slate-300">
                                            Comparable RC + owner data sells at <span className="font-bold text-white">₹{RIVAL_PREMIUM.price}/call</span> elsewhere.
                                        </p>
                                        <p className="text-xs text-slate-400 mt-1">
                                            Titanium delivers the same mobile, owner name and address for ₹62.50 —
                                            {' '}{Math.round((1 - 62.5 / RIVAL_PREMIUM.price) * 100)}% below the market rate.
                                        </p>
                                    </div>

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
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                                    <div>
                                                        <label className="block text-xs text-slate-400 mb-1">₹ per credit (all-in)</label>
                                                        <input
                                                            type="number" min="0" step="0.01"
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
                                                </div>
                                                <p className="text-xs text-slate-500 mt-3">
                                                    ₹{calcCost} covers both API calls behind one credit — mobile number, owner name and address.
                                                    True cost per delivered credit: <span className="text-white font-semibold">{inr(trueCostPerCredit)}</span>
                                                    {' '}(₹{calcCost} ÷ {calcSuccessRate}% success), because a failed lookup isn't charged to the client but was still queried.
                                                </p>
                                            </div>

                                            <div className="bg-white/5 border border-white/10 p-5 rounded-xl">
                                                <h4 className="text-slate-200 font-semibold mb-1">Where you sit in the market</h4>
                                                <p className="text-xs text-slate-400 mb-4">
                                                    Break-even is {inr(trueCostPerCredit)}/credit, so every price on this line is profitable.
                                                    Position is a choice here, not an economic constraint.
                                                </p>

                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm min-w-[460px]">
                                                        <thead className="text-slate-400 text-xs">
                                                            <tr className="border-b border-white/10">
                                                                <th className="text-left pb-2">Rate</th>
                                                                <th className="text-left pb-2">Who</th>
                                                                <th className="text-right pb-2">Your margin there</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            <tr className="border-b border-white/5">
                                                                <td className="py-2 font-bold text-white">₹{RIVAL_PREMIUM.price}</td>
                                                                <td className="py-2 text-slate-300">Premium rival — {RIVAL_PREMIUM.has}</td>
                                                                <td className="py-2 text-right text-green-400">
                                                                    {Math.round((1 - trueCostPerCredit / RIVAL_PREMIUM.price) * 100)}%
                                                                </td>
                                                            </tr>
                                                            <tr className="border-b border-white/5 bg-indigo-500/10">
                                                                <td className="py-2 font-bold text-indigo-300">₹55–89</td>
                                                                <td className="py-2 text-indigo-200">You — RC + owner name & address</td>
                                                                <td className="py-2 text-right text-green-400">88–92%</td>
                                                            </tr>
                                                            <tr>
                                                                <td className="py-2 font-bold text-white">₹{RIVAL_BUDGET.price}</td>
                                                                <td className="py-2 text-slate-300">Budget rival — {RIVAL_BUDGET.has}</td>
                                                                <td className="py-2 text-right text-amber-400">
                                                                    {Math.round((1 - trueCostPerCredit / RIVAL_BUDGET.price) * 100)}%
                                                                </td>
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                </div>

                                                <p className="text-xs text-slate-400 mt-3">
                                                    You could match ₹{RIVAL_BUDGET.price} and still keep
                                                    {' '}{Math.round((1 - trueCostPerCredit / RIVAL_BUDGET.price) * 100)}% margin — which is exactly why you must not.
                                                    Price is the budget rival's only weapon; matching it hands them the one fight they're equipped for
                                                    and throws away {inr(62.5 - RIVAL_BUDGET.price)} a credit for nothing.
                                                </p>
                                            </div>

                                            <div className="bg-white/5 border border-amber-500/30 p-5 rounded-xl">
                                                <h4 className="text-amber-400 font-semibold mb-3">When they say "X sells at ₹{RIVAL_BUDGET.price}"</h4>
                                                <ul className="text-sm text-slate-300 space-y-2">
                                                    <li>
                                                        <span className="text-white font-medium">Never match it, and never rubbish them.</span>{' '}
                                                        Ask instead: "who picks up when a lookup fails on a Friday evening?" You're selling the answer to that.
                                                    </li>
                                                    <li>
                                                        <span className="text-white font-medium">Make the risk concrete.</span>{' '}
                                                        Prepaid credits with no support is money handed over against a promise. Offer the 25-credit pilot —
                                                        it costs you {inr(25 * trueCostPerCredit)} and it's the thing they can't get from a vanishing supplier.
                                                    </li>
                                                    <li>
                                                        <span className="text-white font-medium">Move the comparison off unit price.</span>{' '}
                                                        A failed lookup they can't chase costs more than the {inr(62.5 - RIVAL_BUDGET.price)} they'd save on it.
                                                    </li>
                                                    <li>
                                                        <span className="text-white font-medium">If they still only want cheap, let them go.</span>{' '}
                                                        They'll be back after the first bad batch, and you keep your rate card intact for everyone else.
                                                    </li>
                                                </ul>
                                            </div>

                                            <div className="bg-white/5 border border-indigo-500/30 p-5 rounded-xl">
                                                <h4 className="text-indigo-400 font-semibold mb-2">The gap to ₹{RIVAL_PREMIUM.price} is product, not price</h4>
                                                <p className="text-sm text-slate-300">
                                                    They charge {Math.round((RIVAL_PREMIUM.price / 62.5 - 1) * 100)}% more than Titanium because they bundle {RIVAL_PREMIUM.has}.
                                                    That's the only thing separating you — on RC data itself you deliver the same mobile, owner name and address.
                                                </p>
                                                <p className="text-sm text-slate-300 mt-2">
                                                    Adding one enrichment source would let you sell at ₹{RIVAL_PREMIUM.price} against the same buyers.
                                                    At {inr(trueCostPerCredit)} of cost, even an expensive second data source stays comfortably profitable —
                                                    worth pricing out before you spend another negotiation defending ₹62.50.
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
                                            <label className="block text-xs font-semibold text-slate-300 mb-2">b · Cost per credit (₹)</label>
                                            <input
                                                type="number" min="0" step="0.01"
                                                value={calcCost}
                                                onChange={(e) => setCalcCost(Number(e.target.value))}
                                                className="input-field text-sm"
                                            />
                                            <p className="text-[11px] text-slate-500 mt-2">
                                                All-in for both API calls behind one credit — mobile, owner name and address.
                                            </p>
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
                                            ₹{calcCost} ÷ {calcSuccessRate}% success rate. A lookup that returns no mobile is never
                                            charged to the client but still drew on the wallet, so those attempts are priced in here.
                                            Set success to 100% if IDSPay doesn't bill failed queries.
                                        </p>
                                    </div>

                                    {/* --- buffer --- */}
                                    <div className="bg-slate-900/50 p-5 rounded-xl border border-white/10">
                                        <label className="block text-xs text-slate-400 mb-1">Lag buffer %</label>
                                        <input
                                            type="number" min="0" max="100" step="5"
                                            value={walletBuffer}
                                            onChange={(e) => setWalletBuffer(Number(e.target.value))}
                                            className="input-field text-sm max-w-[8rem]"
                                        />
                                        <p className="text-[11px] text-slate-500 mt-2">
                                            Held back because IDSPay only reflects spend after about an hour.
                                        </p>
                                    </div>

                                    {/* --- where the wallet stands against credits that already exist --- */}
                                    {!walletBalanceKnown ? (
                                        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-5">
                                            <h4 className="text-amber-400 font-semibold">Enter the wallet balance</h4>
                                            <p className="text-sm text-slate-300 mt-1">
                                                Without <span className="font-semibold">a</span> there's nothing to compare the {inr(currentLiability)} of
                                                outstanding commitments against.
                                            </p>
                                        </div>
                                    ) : topUpNeeded > 0 ? (
                                        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-5">
                                            <h4 className="text-red-400 font-semibold mb-1">Recharge IDSPay</h4>
                                            <div className="text-3xl sm:text-4xl font-bold text-white my-2 break-words">{inr(topUpNeeded)}</div>
                                            <p className="text-sm text-slate-300">
                                                {outstandingCredits.toLocaleString('en-IN')} credits are already in clients' hands
                                                = {inr(currentLiability)} of provider spend. With a {walletBuffer}% lag buffer the wallet
                                                needs {inr(requiredBalance)} and holds {inr(walletBalance)}.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="bg-green-500/10 border border-green-500/40 rounded-xl p-5">
                                            <h4 className="text-green-400 font-semibold mb-1">Wallet covers what's outstanding</h4>
                                            <div className="my-2">
                                                <span className="text-3xl sm:text-4xl font-bold text-white break-words">{inr(walletBalance - requiredBalance)}</span>
                                                <span className="text-lg text-slate-300 ml-2">spare</span>
                                            </div>
                                            <p className="text-sm text-slate-300">
                                                {outstandingCredits.toLocaleString('en-IN')} outstanding credits owe {inr(currentLiability)} of provider spend.
                                                With the {walletBuffer}% buffer that needs {inr(requiredBalance)} — the wallet holds {inr(walletBalance)}.
                                            </p>
                                        </div>
                                    )}

                                    {/* --- can the wallet honour what's already been given out? --- */}
                                    <div className={`rounded-xl border p-5 ${
                                        !walletBalanceKnown ? 'bg-white/5 border-white/10'
                                            : fullyCovered ? 'bg-green-500/10 border-green-500/40'
                                            : 'bg-red-500/10 border-red-500/40'
                                    }`}>
                                        <h4 className={`font-semibold mb-1 ${
                                            !walletBalanceKnown ? 'text-slate-300'
                                                : fullyCovered ? 'text-green-400' : 'text-red-400'
                                        }`}>
                                            {!walletBalanceKnown
                                                ? 'Can we honour outstanding credits?'
                                                : fullyCovered
                                                    ? 'Yes — no recharge needed'
                                                    : 'No — these credits will fail'}
                                        </h4>

                                        {walletBalanceKnown && (
                                            <>
                                                <div className="text-3xl sm:text-4xl font-bold text-white my-2 break-words">
                                                    {creditsHonourable.toLocaleString('en-IN')}
                                                    <span className="text-lg text-slate-400 font-medium">
                                                        {' '}of {outstandingCredits.toLocaleString('en-IN')} credits
                                                    </span>
                                                </div>

                                                {/* Covered vs uncovered, at a glance. */}
                                                <div className="h-2 w-full bg-slate-700/60 rounded-full overflow-hidden my-3">
                                                    <div
                                                        className={fullyCovered ? 'h-full bg-green-500' : 'h-full bg-red-500'}
                                                        style={{ width: `${coveragePct}%` }}
                                                    />
                                                </div>

                                                <p className="text-sm text-slate-300">
                                                    {fullyCovered ? (
                                                        <>
                                                            {inr(walletBalance)} covers all {outstandingCredits.toLocaleString('en-IN')} outstanding credits
                                                            at {inr(drainPerCredit)} each, with the {walletBuffer}% buffer held back.
                                                            You can leave the wallet alone.
                                                        </>
                                                    ) : (
                                                        <>
                                                            {inr(walletBalance)} runs dry after {creditsHonourable.toLocaleString('en-IN')} lookups.
                                                            The remaining <span className="font-semibold text-white">{creditsUncovered.toLocaleString('en-IN')} credits</span> are
                                                            sold but unfunded — those clients get failures unless you recharge {inr(topUpNeeded)}.
                                                        </>
                                                    )}
                                                </p>
                                            </>
                                        )}
                                        {!walletBalanceKnown && (
                                            <p className="text-sm text-slate-300 mt-1">
                                                Enter the wallet balance above to see how many of the
                                                {' '}{outstandingCredits.toLocaleString('en-IN')} outstanding credits it can serve.
                                            </p>
                                        )}
                                    </div>

                                    {/* --- worst case vs what actually happens --- */}
                                    {walletBalanceKnown && (
                                        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
                                            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                                                <h4 className="text-sm font-semibold text-slate-300">How much to actually keep in the wallet</h4>
                                                <label className="text-xs text-slate-400 flex items-center gap-2">
                                                    Utilisation
                                                    <input
                                                        type="number" min="1" max="100" step="5"
                                                        value={calcUtilisation}
                                                        onChange={(e) => setCalcUtilisation(Number(e.target.value))}
                                                        className="input-field text-sm w-20 py-1"
                                                    />
                                                    %
                                                </label>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                                                    <div className="text-xs text-slate-400 mb-1">Worst case — everyone burns everything</div>
                                                    <div className="text-xl font-bold text-white">{inr(requiredBalance)}</div>
                                                    <div className={`text-sm mt-1 ${topUpNeeded > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                        {topUpNeeded > 0 ? `Recharge ${inr(topUpNeeded)}` : 'Already covered'}
                                                    </div>
                                                </div>
                                                <div className="bg-white/5 border border-indigo-500/30 rounded-lg p-4">
                                                    <div className="text-xs text-slate-400 mb-1">Realistic — at {calcUtilisation}% utilisation</div>
                                                    <div className="text-xl font-bold text-white">{inr(expectedRequired)}</div>
                                                    <div className={`text-sm mt-1 ${expectedTopUp > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                                                        {expectedTopUp > 0 ? `Recharge ${inr(expectedTopUp)}` : 'Already covered'}
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-3">
                                                Clients historically burn about {calcUtilisation}% of what they buy, so only
                                                {' '}{Math.round(expectedBurnCredits).toLocaleString('en-IN')} of the {outstandingCredits.toLocaleString('en-IN')} outstanding
                                                credits are likely to be claimed. Funding the worst case ties up {inr(Math.max(0, requiredBalance - expectedRequired))} you
                                                probably never need — but it is the only figure that guarantees nobody sees a failure.
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
                                            <div className="text-lg font-bold text-white">{outstandingCredits.toLocaleString('en-IN')}</div>
                                            <div className="text-xs text-slate-400 mt-1">Credits un-availed</div>
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
