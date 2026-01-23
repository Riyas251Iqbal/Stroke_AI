/**
 * Login Page
 * Split-view layout: branding panel on left, login form on right
 */

import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Activity, LogIn, AlertCircle, Shield, Zap, Brain } from 'lucide-react';

export default function Login() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { login } = useAuth();

    const [formData, setFormData] = useState({
        username: '',
        password: '',
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const suggestedRole = searchParams.get('role') || 'patient';

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const auth = await login(formData.username, formData.password);

            // Route based on role
            switch (auth.role) {
                case 'patient':
                    navigate('/patient');
                    break;
                case 'doctor':
                    navigate('/doctor');
                    break;
                case 'admin':
                    navigate('/admin');
                    break;
                default:
                    navigate('/');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const features = [
        { icon: Brain, label: 'AI-Powered Risk Assessment', desc: 'Advanced ML models analyze clinical & speech data' },
        { icon: Zap, label: 'Real-Time Triage', desc: 'Instant prioritization for clinical workflows' },
        { icon: Shield, label: 'Clinical Decision Support', desc: 'Evidence-based recommendations for providers' },
    ];

    return (
        <div className="auth-split">
            {/* Left: Brand Panel */}
            <div className="auth-split-brand">
                {/* Decorative Orbs */}
                <div className="bg-orb bg-orb-1" />
                <div className="bg-orb bg-orb-2" />

                <div style={{ position: 'relative', zIndex: 1, maxWidth: 420 }}>
                    {/* Brand */}
                    <Link to="/" className="inline-flex items-center gap-3 mb-8">
                        <div style={{
                            width: 48, height: 48, borderRadius: '14px',
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 0 30px rgba(59,130,246,0.12)'
                        }}>
                            <Activity size={28} style={{ color: '#3b82f6' }} />
                        </div>
                        <span className="text-3xl font-bold">
                            Stroke<span style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Triage</span>
                        </span>
                    </Link>

                    {/* Tagline */}
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.3, marginBottom: '0.75rem' }}>
                        Early Stroke Detection &amp;<br />Smart Clinical Triage
                    </h2>
                    <p className="text-secondary" style={{ fontSize: '1rem', lineHeight: 1.7, marginBottom: '2.5rem' }}>
                        AI-powered clinical decision support system for healthcare professionals.
                    </p>

                    {/* Features */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {features.map((f, i) => (
                            <div key={i} className="flex items-start gap-3">
                                <div style={{
                                    width: 40, height: 40, borderRadius: '10px',
                                    background: 'rgba(59, 130, 246, 0.08)',
                                    border: '1px solid rgba(59, 130, 246, 0.12)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    <f.icon size={18} style={{ color: '#60a5fa' }} />
                                </div>
                                <div>
                                    <p style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: '0.15rem', color: 'var(--text-primary)' }}>{f.label}</p>
                                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>{f.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right: Login Form */}
            <div className="auth-split-form">
                <div className="w-full" style={{ maxWidth: 400, position: 'relative', zIndex: 1 }}>
                    {/* Mobile-only header (hidden on desktop by auth-split-brand visibility) */}
                    <div className="text-center mb-8 fade-in" style={{ display: 'none' }}>
                        <Link to="/" className="inline-flex items-center gap-2 mb-4">
                            <Activity size={24} style={{ color: '#3b82f6' }} />
                            <span className="text-2xl font-bold">
                                Stroke<span style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Triage</span>
                            </span>
                        </Link>
                    </div>

                    <div className="fade-in" style={{ marginBottom: '2rem' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Welcome back</h2>
                        <p className="text-secondary" style={{ margin: 0 }}>Sign in to your account to continue</p>
                    </div>

                    {/* Login Card */}
                    <div className="glass-card-static slide-up">
                        <form onSubmit={handleSubmit}>
                            {/* Error Message */}
                            {error && (
                                <div className="flex items-center gap-2 p-3 mb-6 rounded-lg" style={{
                                    background: 'rgba(239, 68, 68, 0.10)',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                    color: '#f87171'
                                }}>
                                    <AlertCircle size={18} />
                                    <span className="text-sm">{error}</span>
                                </div>
                            )}

                            {/* Username */}
                            <div className="input-group">
                                <label className="input-label" htmlFor="username">
                                    Username
                                </label>
                                <input
                                    type="text"
                                    id="username"
                                    name="username"
                                    className="input"
                                    placeholder="Enter your username"
                                    value={formData.username}
                                    onChange={handleChange}
                                    required
                                    autoComplete="username"
                                />
                            </div>

                            {/* Password */}
                            <div className="input-group">
                                <label className="input-label" htmlFor="password">
                                    Password
                                </label>
                                <input
                                    type="password"
                                    id="password"
                                    name="password"
                                    className="input"
                                    placeholder="Enter your password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                    autoComplete="current-password"
                                />
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                className="btn btn-primary w-full mt-2"
                                disabled={loading}
                            >
                                {loading ? (
                                    <div className="spinner" style={{ width: '1.25rem', height: '1.25rem' }} />
                                ) : (
                                    <>
                                        <LogIn size={18} />
                                        Sign In
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Register Link */}
                        <p className="text-center text-secondary text-sm mt-6">
                            Don't have an account?{' '}
                            <Link
                                to={`/register?role=${suggestedRole}`}
                                className="font-medium hover:underline"
                                style={{ color: '#60a5fa' }}
                            >
                                Create account
                            </Link>
                        </p>
                    </div>

                    {/* Demo Credentials */}
                    <div className="mt-6 p-4 rounded-lg" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.10)' }}>
                        <p className="text-xs text-muted text-center mb-2">Demo Credentials</p>
                        <div className="flex justify-center gap-4 text-xs">
                            <span className="text-secondary">admin / admin123</span>
                        </div>
                    </div>

                    {/* Back Link */}
                    <div className="text-center mt-6">
                        <Link to="/" className="text-sm text-muted hover:text-secondary" style={{ transition: 'color 0.15s' }}>
                            ← Back to role selection
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
