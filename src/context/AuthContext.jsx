import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch, clearBookmark } from '../lib/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            localStorage.setItem('token', token);
            fetchProfile();
        } else {
            localStorage.removeItem('token');
            setUser(null);
            setLoading(false);
        }
    }, [token]);

    const fetchProfile = async () => {
        try {
            const res = await apiFetch('/api/user/profile', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUser(data);
            } else {
                setToken(null);
            }
        } catch (err) {
            console.error('Failed to fetch profile', err);
            setToken(null);
        } finally {
            setLoading(false);
        }
    };

    // The lookup response already carries the post-deduction balance, so the
    // header can be corrected without spending a round trip on /api/user/profile
    // (the database is far from the colo — see functions/utils/db.js).
    const setCredits = (credits) => {
        setUser((current) => (current ? { ...current, credits } : current));
    };

    const login = (newToken, userData) => {
        setToken(newToken);
        setUser(userData);
    };

    const logout = () => {
        clearBookmark();
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, loading, fetchProfile, setCredits }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
