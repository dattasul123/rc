import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
    const { user, logout, fetchProfile } = useAuth();
    const navigate = useNavigate();
    const [rcNumber, setRcNumber] = useState('');
    const [lookupResult, setLookupResult] = useState(null);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [history, setHistory] = useState([]);
    
    // Password change state
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [pwdData, setPwdData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
    const [pwdError, setPwdError] = useState('');
    const [pwdSuccess, setPwdSuccess] = useState('');
    const [isPwdLoading, setIsPwdLoading] = useState(false);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            const res = await fetch('/api/user/history', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (res.ok) {
                const data = await res.json();
                setHistory(data.history || []);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleLookup = async (e) => {
        e.preventDefault();
        setError('');
        setLookupResult(null);
        setIsLoading(true);

        try {
            const res = await fetch('/api/user/rc-lookup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ rcNumber })
            });
            const data = await res.json();

            if (res.ok) {
                setLookupResult(data);
                fetchProfile(); // Refresh credits
                fetchHistory(); // Refresh history
            } else {
                setError(data.error || data.message || 'Lookup failed');
            }
        } catch (err) {
            setError('An error occurred during lookup.');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        setPwdError('');
        setPwdSuccess('');

        if (pwdData.newPassword !== pwdData.confirmPassword) {
            return setPwdError('New passwords do not match');
        }

        setIsPwdLoading(true);
        try {
            const res = await fetch('/api/user/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ oldPassword: pwdData.oldPassword, newPassword: pwdData.newPassword })
            });
            const data = await res.json();

            if (res.ok) {
                setPwdSuccess('Password changed successfully!');
                setPwdData({ oldPassword: '', newPassword: '', confirmPassword: '' });
                setTimeout(() => {
                    setShowPasswordModal(false);
                    setPwdSuccess('');
                }, 2000);
            } else {
                setPwdError(data.error || 'Failed to change password');
            }
        } catch (err) {
            setPwdError('An error occurred.');
        } finally {
            setIsPwdLoading(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    if (!user) return null;

    return (
        <div className="min-h-screen p-3 sm:p-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
            <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-white/5 backdrop-blur-xl p-4 rounded-xl border border-white/10 shadow-lg">
                <div>
                    <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">RC Lookup Dashboard</h1>
                    <p className="text-slate-200 text-sm sm:text-base font-medium mt-1">Welcome back, <span className="text-white">{user.fullName}</span></p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-6">
                    <div className="flex items-center gap-3 bg-indigo-500/20 border border-indigo-400/30 px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl shadow-inner">
                        <span className="text-indigo-100 font-semibold text-sm sm:text-base uppercase tracking-wider">Credits</span>
                        <span className="text-white font-black text-xl sm:text-2xl drop-shadow-md">{user.credits}</span>
                    </div>
                    {user.role === 'admin' && (
                        <button onClick={() => navigate('/admin')} className="text-base font-bold text-indigo-300 hover:text-indigo-200 transition-colors drop-shadow">
                            Admin Panel
                        </button>
                    )}
                    <button onClick={() => setShowPasswordModal(true)} className="text-base font-bold text-slate-300 hover:text-white transition-colors drop-shadow">
                        Change Password
                    </button>
                    <button onClick={handleLogout} className="text-base font-bold text-red-400 hover:text-red-300 transition-colors drop-shadow">
                        Logout
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                <div className="md:col-span-2 space-y-4 sm:space-y-6">
                    <div className="glass-panel p-5 sm:p-8">
                        <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6 drop-shadow-md">Perform RC Lookup</h2>
                        <form onSubmit={handleLookup} className="flex flex-col sm:flex-row gap-3">
                            <input
                                type="text"
                                className="input-field flex-1 uppercase"
                                placeholder="Enter RC Number (e.g. MH01AB1234)"
                                value={rcNumber}
                                onChange={(e) => setRcNumber(e.target.value.toUpperCase())}
                                required
                            />
                            <button type="submit" className="btn-primary whitespace-nowrap w-full sm:w-auto" disabled={isLoading || user.credits <= 0}>
                                {isLoading ? 'Looking up...' : 'Get RC Details'}
                            </button>
                        </form>
                        {user.credits <= 0 && (
                            <p className="text-red-300 font-semibold text-base mt-4 bg-red-950/40 p-3 rounded-lg border border-red-500/30 inline-block">You don't have enough credits to perform a lookup.</p>
                        )}
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg mt-4 text-sm animate-in">
                                {error}
                            </div>
                        )}
                    </div>

                    {lookupResult && (
                        <div className="glass-panel p-5 sm:p-6 border-indigo-500/30 bg-indigo-500/5 animate-in">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-medium text-white">Lookup Result</h3>
                                {lookupResult.cached && (
                                    <span className="text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">Cached · Free</span>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
                                    <p className="text-slate-400 text-sm">Name</p>
                                    <p className="text-lg font-semibold text-white">{lookupResult.data.ownerName}</p>
                                </div>
                                <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
                                    <p className="text-slate-400 text-sm">Mobile Number</p>
                                    <p className="text-xl font-bold text-green-400">{lookupResult.data.mobileNumber}</p>
                                </div>
                                <div className="bg-white/5 border border-white/10 p-4 rounded-lg col-span-2">
                                    <p className="text-slate-400 text-sm">Address</p>
                                    <p className="text-base font-semibold text-white">{lookupResult.data.address}</p>
                                </div>
                                <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
                                    <p className="text-slate-400 text-sm">Pincode</p>
                                    <p className="text-lg font-semibold text-white">{lookupResult.data.pincode}</p>
                                </div>
                                <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
                                    <p className="text-slate-400 text-sm">Credits Remaining</p>
                                    <p className="text-lg font-semibold text-indigo-400">{lookupResult.remainingCredits}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="md:col-span-1">
                    <div className="glass-panel p-5 sm:p-8 h-full flex flex-col">
                        <h2 className="text-xl font-bold text-white mb-4 sm:mb-6 drop-shadow-md">Recent Lookups</h2>
                        <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                            {history.length === 0 ? (
                                <p className="text-slate-200 text-base font-medium text-center mt-10 bg-black/20 py-4 rounded-xl">No lookups yet.</p>
                            ) : (
                                history.map((item) => (
                                    <div key={item.id} className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-medium text-white">{item.rc_number}</span>
                                            <span className="text-xs text-slate-500">
                                                {new Date(item.lookup_date).toLocaleDateString()}
                                            </span>
                                        </div>
                                        {item.owner_name && (
                                            <div className="text-sm text-slate-300 font-medium">{item.owner_name}</div>
                                        )}
                                        <div className="text-sm font-bold text-green-400 my-0.5">{item.mobile_number}</div>
                                        {item.present_address && (
                                            <div className="text-xs text-slate-400 line-clamp-2 mt-1" title={item.present_address}>{item.present_address}</div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Password Change Modal */}
            {showPasswordModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in">
                    <div className="glass-panel p-6 sm:p-8 w-full max-w-md bg-slate-900/80">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-white">Change Password</h2>
                            <button onClick={() => setShowPasswordModal(false)} className="text-slate-400 hover:text-white">✕</button>
                        </div>

                        {pwdError && <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg mb-4 text-sm">{pwdError}</div>}
                        {pwdSuccess && <div className="bg-green-500/10 border border-green-500/50 text-green-400 p-3 rounded-lg mb-4 text-sm">{pwdSuccess}</div>}

                        <form onSubmit={handlePasswordChange} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Current Password</label>
                                <input
                                    type="password"
                                    required
                                    className="input-field"
                                    value={pwdData.oldPassword}
                                    onChange={e => setPwdData({...pwdData, oldPassword: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">New Password</label>
                                <input
                                    type="password"
                                    required
                                    className="input-field"
                                    value={pwdData.newPassword}
                                    onChange={e => setPwdData({...pwdData, newPassword: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Confirm New Password</label>
                                <input
                                    type="password"
                                    required
                                    className="input-field"
                                    value={pwdData.confirmPassword}
                                    onChange={e => setPwdData({...pwdData, confirmPassword: e.target.value})}
                                />
                            </div>
                            <button type="submit" className="btn-primary w-full mt-4" disabled={isPwdLoading}>
                                {isPwdLoading ? 'Updating...' : 'Update Password'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
