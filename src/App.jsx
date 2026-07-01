import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';

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
                    <Route path="/signup" element={<Signup />} />
                    
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
                </Routes>
            </Router>
        </>
    );
}

export default App;
