import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';

// Unlinked, owner-only. Lazy so it is split into its own chunk and its markup
// never appears in the bundle every user downloads. The real gate is
// server-side (LEDGER_OWNER_EMAIL) — this only keeps it out of casual sight.
const Ledger = lazy(() => import('./pages/Ledger'));

function ProtectedRoute({ children, adminOnly = false }) {
    const { user } = useAuth();
    
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    
    if (adminOnly && user.role !== 'admin') {
        return <Navigate to="/dashboard" replace />;
    }
    
    return children;
}

function App() {
    return (
        <>
            {/* Background Image */}
            <img
                src="/bg.jpg"
                alt=""
                className="fixed top-0 left-0 w-full h-full object-cover -z-10"
            />
            
            {/* Overlay to ensure text readability */}
            <div className="fixed top-0 left-0 w-full h-full bg-slate-900/40 -z-10"></div>

            <Router>
                <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/login" element={<Login />} />
                    
                    <Route path="/dashboard" element={
                        <ProtectedRoute>
                            <Dashboard />
                        </ProtectedRoute>
                    } />
                    
                    <Route path="/admin" element={
                        <ProtectedRoute adminOnly={true}>
                            <AdminPanel />
                        </ProtectedRoute>
                    } />

                    {/* Deliberately not linked from anywhere. Any logged-in user
                        may load it; only the owner's token gets data back. */}
                    <Route path="/ledger" element={
                        <ProtectedRoute>
                            <Suspense fallback={null}>
                                <Ledger />
                            </Suspense>
                        </ProtectedRoute>
                    } />
                </Routes>
            </Router>
        </>
    );
}

export default App;
