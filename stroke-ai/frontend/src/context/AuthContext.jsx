/**
 * Authentication Context
 * Manages user authentication state across the application
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Initialize auth state from localStorage
    useEffect(() => {
        const initAuth = async () => {
            const token = localStorage.getItem('token');
            const storedUser = localStorage.getItem('user');

            if (token && storedUser) {
                try {
                    // Verify token is still valid
                    await authAPI.verifyToken();
                    setUser(JSON.parse(storedUser));
                } catch (error) {
                    // Token invalid, clear storage
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                }
            }
            setLoading(false);
        };

        initAuth();
    }, []);

    // Login function
    const login = async (username, password) => {
        const response = await authAPI.login({ username, password });
        const { auth } = response.data;

        // Store token and user
        localStorage.setItem('token', auth.token);
        localStorage.setItem('user', JSON.stringify({
            id: auth.user_id,
            username: auth.username,
            role: auth.role,
            fullName: auth.full_name,
            email: auth.email,
            gender: auth.gender,
        }));

        setUser({
            id: auth.user_id,
            username: auth.username,
            role: auth.role,
            fullName: auth.full_name,
            email: auth.email,
            gender: auth.gender,
        });

        return auth;
    };

    // Register function
    const register = async (userData) => {
        const response = await authAPI.register(userData);
        return response.data;
    };

    // Logout function
    const logout = async () => {
        try {
            await authAPI.logout();
        } catch (error) {
            // Continue logout even if API call fails
        }

        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
    };

    // Check if user has specific role
    const hasRole = (roles) => {
        if (!user) return false;
        if (typeof roles === 'string') return user.role === roles;
        return roles.includes(user.role);
    };

    const value = {
        user,
        loading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        hasRole,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
