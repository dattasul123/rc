import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Credit-grant ledger. Reachable only by typing the path — nothing anywhere in
// the app links here, and /api/ledger answers 404 to everyone except the
// address in LEDGER_OWNER_EMAIL, so a staff admin who finds the route still
// sees an empty page that looks like a dead link.

// SQLite writes CURRENT_TIMESTAMP as UTC with no zone marker. Parsing it raw
// makes the browser read it as local time and shifts everything by +5:30, which
// would put grants on the wrong side of the review checkpoint.
const parseUtc = (s) => new Date(`${String(s).replace(' ', 'T')}Z`);

export default function Ledger() {
    const navigate = useNavigate();
    const [grants, setGrants] = useState([]);
    const [reviewedAt, setReviewedAt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [denied, setDenied] = useState(false);
    const [marking, setMarking] = useState(false);

    useEffect(() => {
        load();
    }, []);

    const load = async () => {
        try {
            const res = await fetch('/api/ledger', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (!res.ok) {
                setDenied(true);
                return;
            }
            const data = await res.json();
            setGrants(data.grants || []);
            setReviewedAt(data.reviewedAt || null);
        } catch {
            setDenied(true);
        } finally {
            setLoading(false);
        }
    };

    const markReviewed = async () => {
        setMarking(true);
        try {
            const res = await fetch('/api/ledger', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (res.ok) {
                const data = await res.json();
                setReviewedAt(data.reviewedAt);
            }
        } catch {
            /* leave the checkpoint where it was */
        } finally {
            setMarking(false);
        }
    };

    // Anyone who is not the owner gets the same blank nothing a mistyped URL
    // would give, with no hint that a ledger exists here.
    if (denied) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="text-center">
                    <p className="text-slate-400">Page not found.</p>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="text-sm text-slate-500 hover:text-slate-300 mt-3"
                    >
                        Go to dashboard
                    </button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-slate-400 text-sm">Loading…</p>
            </div>
        );
    }

    const checkpoint = reviewedAt ? parseUtc(reviewedAt).getTime() : 0;
    const isNew = (row) => parseUtc(row.created_at).getTime() > checkpoint;

    const newRows = grants.filter(isNew);
    const newCredits = newRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const totalCredits = grants.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    // Running total per recipient, built oldest-first so each row can show what
    // that user had been given up to and including that grant. This is what
    // exposes a slow drip that never looks large on any single row.
    const cumulative = {};
    const runningById = {};
    [...grants].reverse().forEach((r) => {
        cumulative[r.user_id] = (cumulative[r.user_id] || 0) + (Number(r.amount) || 0);
        runningById[r.id] = cumulative[r.user_id];
    });

    // Who handed out what, which is the actual point of the page.
    const byStaff = {};
    grants.forEach((r) => {
        const key = r.admin_email || 'unrecorded';
        if (!byStaff[key]) {
            byStaff[key] = { name: r.admin_name || 'Not recorded', email: r.admin_email, total: 0, count: 0, fresh: 0 };
        }
        byStaff[key].total += Number(r.amount) || 0;
        byStaff[key].count += 1;
        if (isNew(r)) byStaff[key].fresh += Number(r.amount) || 0;
    });
    const staffRows = Object.values(byStaff).sort((a, b) => b.total - a.total);

    const fmtDate = (s) => parseUtc(s).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    return (
        <div className="min-h-screen p-3 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
            <header className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center bg-white/5 backdrop-blur-xl p-4 rounded-xl border border-white/10">
                <div>
                    <h1 className="text-xl font-bold text-white">Credit Ledger</h1>
                    <p className="text-xs text-slate-400 mt-1">
                        {reviewedAt
                            ? `Last reviewed ${fmtDate(reviewedAt)}`
                            : 'Never reviewed — everything below is new'}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="text-sm text-slate-400 hover:text-white transition-colors"
                    >
                        Dashboard
                    </button>
                    <button
                        onClick={markReviewed}
                        disabled={marking || newRows.length === 0}
                        className="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {marking ? 'Saving…' : 'Mark reviewed'}
                    </button>
                </div>
            </header>

            {/* Since the last checkpoint */}
            <div className={`rounded-xl border p-5 ${
                newRows.length > 0
                    ? 'bg-amber-500/10 border-amber-500/40'
                    : 'bg-white/5 border-white/10'
            }`}>
                <h2 className={`font-semibold ${newRows.length > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                    {newRows.length > 0 ? 'New since you last looked' : 'Nothing new since your last review'}
                </h2>
                {newRows.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-3">
                        <div>
                            <div className="text-2xl font-bold text-white">{newRows.length}</div>
                            <div className="text-xs text-slate-400 mt-1">Grants</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-white">{newCredits.toLocaleString('en-IN')}</div>
                            <div className="text-xs text-slate-400 mt-1">Credits handed out</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-white">
                                {new Set(newRows.map((r) => r.admin_email || 'unrecorded')).size}
                            </div>
                            <div className="text-xs text-slate-400 mt-1">Staff involved</div>
                        </div>
                    </div>
                )}
                <p className="text-xs text-slate-400 mt-3">
                    "Mark reviewed" moves the line to now. Everything granted after that shows up here next time you open this page.
                </p>
            </div>

            {/* Per-staff totals */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-slate-300 mb-3">By staff account</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[520px]">
                        <thead className="text-slate-400 text-xs">
                            <tr className="border-b border-white/10">
                                <th className="text-left pb-2">Who granted</th>
                                <th className="text-right pb-2">Grants</th>
                                <th className="text-right pb-2">Credits (all time)</th>
                                <th className="text-right pb-2">Since review</th>
                            </tr>
                        </thead>
                        <tbody>
                            {staffRows.map((s) => (
                                <tr key={s.email || 'unrecorded'} className="border-b border-white/5">
                                    <td className="py-2">
                                        <div className="text-white">{s.name}</div>
                                        {s.email && <div className="text-xs text-slate-500">{s.email}</div>}
                                    </td>
                                    <td className="py-2 text-right text-slate-300">{s.count}</td>
                                    <td className="py-2 text-right text-white font-semibold">{s.total.toLocaleString('en-IN')}</td>
                                    <td className={`py-2 text-right font-semibold ${s.fresh > 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                                        {s.fresh > 0 ? s.fresh.toLocaleString('en-IN') : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Every grant */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                    <h2 className="text-sm font-semibold text-slate-300">Every credit grant</h2>
                    <span className="text-xs text-slate-400">
                        {grants.length} grants · {totalCredits.toLocaleString('en-IN')} credits total
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                        <thead className="text-slate-400 text-xs">
                            <tr className="border-b border-white/10">
                                <th className="text-left pb-2">When</th>
                                <th className="text-left pb-2">To user</th>
                                <th className="text-right pb-2">Credits</th>
                                <th className="text-right pb-2">Their running total</th>
                                <th className="text-left pb-2 pl-4">Granted by</th>
                                <th className="text-left pb-2">Note</th>
                            </tr>
                        </thead>
                        <tbody>
                            {grants.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-6 text-center text-slate-500">No credit grants recorded yet.</td>
                                </tr>
                            ) : grants.map((r) => (
                                <tr
                                    key={r.id}
                                    className={`border-b border-white/5 ${isNew(r) ? 'bg-amber-500/5' : ''}`}
                                >
                                    <td className="py-2 whitespace-nowrap">
                                        <span className="text-slate-300">{fmtDate(r.created_at)}</span>
                                        {isNew(r) && (
                                            <span className="ml-2 text-[10px] font-bold text-amber-400 bg-amber-400/20 px-1.5 py-0.5 rounded">NEW</span>
                                        )}
                                    </td>
                                    <td className="py-2">
                                        <div className="text-white">{r.user_name || `user ${r.user_id}`}</div>
                                        <div className="text-xs text-slate-500">{r.user_email}</div>
                                    </td>
                                    <td className="py-2 text-right text-white font-semibold">
                                        +{Number(r.amount).toLocaleString('en-IN')}
                                    </td>
                                    <td className="py-2 text-right text-slate-400">
                                        {runningById[r.id].toLocaleString('en-IN')}
                                    </td>
                                    <td className="py-2 pl-4">
                                        {r.admin_email ? (
                                            <>
                                                <div className="text-slate-300">{r.admin_name}</div>
                                                <div className="text-xs text-slate-500">{r.admin_email}</div>
                                            </>
                                        ) : (
                                            <span className="text-amber-400 text-xs">not recorded</span>
                                        )}
                                    </td>
                                    <td className="py-2 text-slate-400 text-xs">{r.description}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
