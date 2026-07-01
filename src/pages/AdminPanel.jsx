import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function AdminPanel() {
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [creditAmount, setCreditAmount] = useState(10);
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [activeTab, setActiveTab] = useState('users');

    const emptyNewUser = { fullName: '', email: '', password: '', role: 'user', credits: 0 };
    const [newUser, setNewUser] = useState(emptyNewUser);
    const [isCreating, setIsCreating] = useState(false);
    const [createMessage, setCreateMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [usersRes, transRes] = await Promise.all([
                fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }),
                fetch('/api/admin/transactions', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
            ]);

            if (usersRes.ok) setUsers((await usersRes.json()).users);
            if (transRes.ok) setTransactions((await transRes.json()).transactions);
        } catch (err) {
            console.error('Failed to fetch admin data', err);
        }
    };

    const handleRecharge = async (e) => {
        e.preventDefault();
        if (!selectedUserId || creditAmount <= 0) return;

        setIsLoading(true);
        setMessage({ type: '', text: '' });

        try {
            const res = await fetch('/api/admin/add-credits', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ userId: selectedUserId, amount: parseInt(creditAmount) })
            });

            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: data.message });
                setCreditAmount(10);
                setSelectedUserId('');
                fetchData(); // Refresh data
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to add credits' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Network error' });
        } finally {
            setIsLoading(false);
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

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
            <header className="flex justify-between items-center bg-white/5 backdrop-blur-xl p-4 rounded-xl border border-white/10 shadow-lg">
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                    <div className="glass-panel p-6">
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
                                <label className="block text-sm font-medium text-slate-300 mb-1">Email (User ID)</label>
                                <input
                                    type="email"
                                    className="input-field"
                                    placeholder="user@example.com"
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

                    <div className="glass-panel p-6">
                        <h2 className="text-lg font-semibold text-white mb-4">Recharge Credits</h2>
                        {message.text && (
                            <div className={`p-3 rounded-lg mb-4 text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/50' : 'bg-red-500/10 text-red-400 border border-red-500/50'}`}>
                                {message.text}
                            </div>
                        )}
                        <form onSubmit={handleRecharge} className="space-y-4">
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
                                {isLoading ? 'Processing...' : 'Add Credits'}
                            </button>
                        </form>
                    </div>

                    <div className="glass-panel p-6">
                        <h2 className="text-lg font-semibold text-white mb-2">System Stats</h2>
                        <div className="space-y-3 mt-4">
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
                    <div className="glass-panel overflow-hidden h-[600px] flex flex-col">
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
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            {activeTab === 'users' ? (
                                <table className="w-full text-left text-sm">
                                    <thead className="text-slate-400 bg-slate-900/50 backdrop-blur-md border-b border-white/10">
                                        <tr>
                                            <th className="pb-3 px-4">Name / Email</th>
                                            <th className="pb-3 px-4">Role</th>
                                            <th className="pb-3 px-4">Credits</th>
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
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <table className="w-full text-left text-sm">
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
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
