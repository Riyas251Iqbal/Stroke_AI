/**
 * Register Page
 * Sectioned form with two-column layout for better structure
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { hospitalAPI } from '../services/api';
import {
    Activity,
    UserPlus,
    AlertCircle,
    CheckCircle,
    MapPin,
    Building2
} from 'lucide-react';

export default function Register() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { register } = useAuth();

    const [formData, setFormData] = useState({
        username: '',
        password: '',
        confirmPassword: '',
        full_name: '',
        email: '',
        role: searchParams.get('role') || 'patient',
        date_of_birth: '',
        gender: 'Male',
        address: '',
        hospital_id: '',
        preferred_doctor_id: '',
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [hospitals, setHospitals] = useState([]);
    const [doctors, setDoctors] = useState([]);

    useEffect(() => {
        hospitalAPI.getAll().then(res => setHospitals(res.data.hospitals || [])).catch(() => { });
    }, []);

    useEffect(() => {
        if (formData.hospital_id) {
            hospitalAPI.getDoctors(formData.hospital_id)
                .then(res => setDoctors(res.data.doctors || []))
                .catch(() => setDoctors([]));
        } else {
            setDoctors([]);
        }
    }, [formData.hospital_id]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        if (formData.role === 'patient' && !formData.address.trim()) {
            setError('Address is required for patient accounts (for emergency response)');
            return;
        }

        setLoading(true);

        try {
            const payload = {
                username: formData.username,
                password: formData.password,
                full_name: formData.full_name,
                email: formData.email,
                role: formData.role,
            };
            if (formData.role === 'patient') {
                payload.date_of_birth = formData.date_of_birth;
                payload.gender = formData.gender;
                payload.address = formData.address;
            }
            if (formData.hospital_id) {
                payload.hospital_id = parseInt(formData.hospital_id);
            }
            if (formData.role === 'patient' && formData.preferred_doctor_id) {
                payload.preferred_doctor_id = parseInt(formData.preferred_doctor_id);
            }
            await register(payload);

            setSuccess(true);
            setTimeout(() => {
                navigate('/login');
            }, 2000);
        } catch (err) {
            setError(err.response?.data?.error || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="glass-card-static text-center max-w-md slide-up">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>
                        <CheckCircle size={32} style={{ color: '#10b981' }} />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">Account Created!</h2>
                    <p className="text-secondary">Redirecting to login...</p>
                </div>
            </div>
        );
    }

    const roleButtonStyle = (isActive) => ({
        flex: 1,
        padding: '0.75rem',
        borderRadius: '0.75rem',
        border: isActive
            ? '2px solid #3b82f6'
            : '1px solid rgba(255,255,255,0.08)',
        background: isActive
            ? 'rgba(59, 130, 246, 0.12)'
            : 'rgba(255,255,255,0.03)',
        color: isActive ? '#60a5fa' : 'var(--text-secondary)',
        fontWeight: isActive ? '600' : '400',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        fontSize: '0.9375rem',
    });

    return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ position: 'relative', overflow: 'hidden' }}>
            {/* Decorative Background Orbs */}
            <div className="bg-orb bg-orb-1" />
            <div className="bg-orb bg-orb-2" />

            <div className="w-full" style={{ maxWidth: 560, position: 'relative', zIndex: 1 }}>
                {/* Header */}
                <div className="text-center mb-8 fade-in">
                    <Link to="/" className="inline-flex items-center gap-2 mb-4">
                        <div style={{
                            width: 40, height: 40, borderRadius: '12px',
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Activity size={24} style={{ color: '#3b82f6' }} />
                        </div>
                        <span className="text-2xl font-bold">
                            Stroke<span style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Triage</span>
                        </span>
                    </Link>
                    <h2 className="text-xl text-secondary">
                        Create your account
                    </h2>
                </div>

                {/* Register Card */}
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

                        {/* ── Section: Account Type ── */}
                        <div className="form-section-label">Account Type</div>
                        <div className="input-group">
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, role: 'patient' })}
                                    style={roleButtonStyle(formData.role === 'patient')}
                                >
                                    🩺 Patient
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, role: 'doctor' })}
                                    style={roleButtonStyle(formData.role === 'doctor')}
                                >
                                    👨‍⚕️ Healthcare Provider
                                </button>
                            </div>
                        </div>

                        <div className="divider" />

                        {/* ── Section: Personal Information ── */}
                        <div className="form-section-label">Personal Information</div>
                        <div className="form-grid">
                            {/* Full Name */}
                            <div className="input-group">
                                <label className="input-label" htmlFor="full_name">
                                    Full Name
                                </label>
                                <input
                                    type="text"
                                    id="full_name"
                                    name="full_name"
                                    className="input"
                                    placeholder="Enter your full name"
                                    value={formData.full_name}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            {/* Email */}
                            <div className="input-group">
                                <label className="input-label" htmlFor="email">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    id="email"
                                    name="email"
                                    className="input"
                                    placeholder="Enter your email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            {/* Date of Birth (patients only) */}
                            {formData.role === 'patient' && (
                                <div className="input-group">
                                    <label className="input-label" htmlFor="date_of_birth">
                                        Date of Birth
                                    </label>
                                    <input
                                        type="date"
                                        id="date_of_birth"
                                        name="date_of_birth"
                                        className="input"
                                        value={formData.date_of_birth}
                                        onChange={handleChange}
                                        max={new Date().toISOString().split('T')[0]}
                                        required
                                    />
                                </div>
                            )}

                            {/* Gender (patients only) */}
                            {formData.role === 'patient' && (
                                <div className="input-group">
                                    <label className="input-label" htmlFor="gender">
                                        Gender
                                    </label>
                                    <select
                                        id="gender"
                                        name="gender"
                                        className="select"
                                        value={formData.gender}
                                        onChange={handleChange}
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Address (patients only — full width) */}
                        {formData.role === 'patient' && (
                            <div className="input-group">
                                <label className="input-label" htmlFor="address">
                                    <MapPin size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                                    Home Address *
                                </label>
                                <textarea
                                    id="address"
                                    name="address"
                                    className="input"
                                    rows="2"
                                    placeholder="Enter your full home address (for emergency ambulance dispatch)"
                                    value={formData.address}
                                    onChange={handleChange}
                                    required
                                    style={{ resize: 'vertical' }}
                                />
                                <p className="text-xs text-muted mt-1">
                                    🚑 This address will be used to dispatch an ambulance in case of emergency.
                                </p>
                            </div>
                        )}

                        <div className="divider" />

                        {/* ── Section: Hospital & Provider ── */}
                        <div className="form-section-label">Hospital &amp; Provider</div>

                        <div className="input-group">
                            <label className="input-label" htmlFor="hospital_id">
                                <Building2 size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                                {formData.role === 'doctor' ? 'Affiliated Hospital' : 'Preferred Hospital'}
                            </label>
                            <select
                                id="hospital_id"
                                name="hospital_id"
                                className="select"
                                value={formData.hospital_id}
                                onChange={handleChange}
                            >
                                <option value="">Select a hospital...</option>
                                {hospitals.map(h => (
                                    <option key={h.id} value={h.id}>
                                        {h.name} — {h.location}
                                    </option>
                                ))}
                            </select>
                            {hospitals.length === 0 && (
                                <p className="text-xs text-muted mt-1">
                                    No hospitals available yet. Contact admin to add hospitals.
                                </p>
                            )}
                        </div>

                        {/* Doctor Selection - Patients only, after hospital is chosen */}
                        {formData.role === 'patient' && formData.hospital_id && (
                            <div className="input-group">
                                <label className="input-label" htmlFor="preferred_doctor">
                                    Preferred Doctor (Optional)
                                </label>
                                {doctors.length > 0 ? (
                                    <div className="space-y-2">
                                        {doctors.map(doc => (
                                            <label
                                                key={doc.id}
                                                className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                                                style={{
                                                    background: formData.preferred_doctor_id === String(doc.id)
                                                        ? 'rgba(59, 130, 246, 0.10)'
                                                        : 'rgba(255,255,255,0.03)',
                                                    border: formData.preferred_doctor_id === String(doc.id)
                                                        ? '1px solid rgba(59, 130, 246, 0.25)'
                                                        : '1px solid rgba(255,255,255,0.06)'
                                                }}
                                            >
                                                <input
                                                    type="radio"
                                                    name="preferred_doctor_id"
                                                    value={doc.id}
                                                    checked={formData.preferred_doctor_id === String(doc.id)}
                                                    onChange={handleChange}
                                                />
                                                <div>
                                                    <p className="text-sm font-medium">{doc.full_name}</p>
                                                    {doc.email && <p className="text-xs text-muted">{doc.email}</p>}
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted">
                                        No doctors registered at this hospital yet.
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="divider" />

                        {/* ── Section: Credentials ── */}
                        <div className="form-section-label">Login Credentials</div>

                        {/* Username — full width */}
                        <div className="input-group">
                            <label className="input-label" htmlFor="username">
                                Username
                            </label>
                            <input
                                type="text"
                                id="username"
                                name="username"
                                className="input"
                                placeholder="Choose a username"
                                value={formData.username}
                                onChange={handleChange}
                                required
                            />
                        </div>

                        {/* Password + Confirm side by side */}
                        <div className="form-grid">
                            <div className="input-group">
                                <label className="input-label" htmlFor="password">
                                    Password
                                </label>
                                <input
                                    type="password"
                                    id="password"
                                    name="password"
                                    className="input"
                                    placeholder="Create a password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            <div className="input-group">
                                <label className="input-label" htmlFor="confirmPassword">
                                    Confirm Password
                                </label>
                                <input
                                    type="password"
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    className="input"
                                    placeholder="Confirm your password"
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
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
                                    <UserPlus size={18} />
                                    Create Account
                                </>
                            )}
                        </button>
                    </form>

                    {/* Login Link */}
                    <p className="text-center text-secondary text-sm mt-6">
                        Already have an account?{' '}
                        <Link
                            to="/login"
                            className="font-medium hover:underline"
                            style={{ color: '#60a5fa' }}
                        >
                            Sign in
                        </Link>
                    </p>
                </div>

                {/* Back Link */}
                <div className="text-center mt-6">
                    <Link to="/" className="text-sm text-muted hover:text-secondary" style={{ transition: 'color 0.15s' }}>
                        ← Back to role selection
                    </Link>
                </div>
            </div>
        </div>
    );
}
