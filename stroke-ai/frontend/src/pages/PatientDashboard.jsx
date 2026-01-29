/**
 * Patient Dashboard
 * Shows triage history, quick actions, analytics charts, and latest assessment results
 */

import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { triageAPI, appointmentAPI } from '../services/api';
import {
    Activity,
    ClipboardList,
    TrendingUp,
    Clock,
    AlertTriangle,
    ChevronRight,
    LogOut,
    User,
    Mic,
    Trash2,
    Calendar,
    BarChart3,
    Shield
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

function TriageBadge({ level }) {
    const config = {
        Low: { className: 'triage-badge-low', label: 'LOW RISK' },
        Medium: { className: 'triage-badge-medium', label: 'MEDIUM RISK' },
        High: { className: 'triage-badge-high', label: 'HIGH RISK' },
        Emergency: { className: 'triage-badge-emergency', label: 'EMERGENCY' },
    };
    const { className, label } = config[level] || config.Low;
    return <span className={`triage-badge ${className}`}>{label}</span>;
}

export default function PatientDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAllHistory, setShowAllHistory] = useState(false);
    const [stats, setStats] = useState({ total: 0, avgRisk: 0, lastLevel: null });
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteReason, setDeleteReason] = useState('');
    const [deletionStatus, setDeletionStatus] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [appointments, setAppointments] = useState([]);

    useEffect(() => {
        fetchHistory();
        fetchDeletionStatus();
        fetchAppointments();
    }, []);

    const fetchHistory = async () => {
        try {
            const response = await triageAPI.getHistory({ limit: 10 });
            const historyData = response.data.history || [];
            setHistory(historyData);

            if (historyData.length > 0) {
                const avgRisk = historyData.reduce((sum, h) => sum + h.risk_score, 0) / historyData.length;
                setStats({
                    total: historyData.length,
                    avgRisk: avgRisk,
                    lastLevel: historyData[0].triage_level,
                });
            }
        } catch (error) {
            console.error('Error fetching history:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAppointments = async () => {
        try {
            const res = await appointmentAPI.list({ status: 'scheduled' });
            setAppointments(res.data.appointments || []);
        } catch (e) {
            console.error('Error fetching appointments:', e);
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const fetchDeletionStatus = async () => {
        try {
            const res = await triageAPI.getDeletionStatus();
            setDeletionStatus(res.data.deletion_request);
        } catch (e) {
            console.error('Error fetching deletion status:', e);
        }
    };

    const handleRequestDeletion = async () => {
        setDeleteLoading(true);
        try {
            await triageAPI.requestDeletion(deleteReason);
            setShowDeleteModal(false);
            setDeleteReason('');
            fetchDeletionStatus();
            alert('Your account deletion request has been submitted. An admin will review it.');
        } catch (error) {
            alert(error.response?.data?.error || 'Failed to submit deletion request');
        } finally {
            setDeleteLoading(false);
        }
    };

    // ── Chart Data ──
    const TRIAGE_COLORS = { Low: '#10b981', Medium: '#f59e0b', High: '#f97316', Emergency: '#ef4444' };

    const trendData = useMemo(() => {
        if (!history.length) return [];
        return [...history].reverse().map((h, i) => ({
            name: new Date(h.assessment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            risk: Math.round(h.risk_score * 100),
            level: h.triage_level,
        }));
    }, [history]);

    const pieData = useMemo(() => {
        if (!history.length) return [];
        const counts = {};
        history.forEach(h => {
            counts[h.triage_level] = (counts[h.triage_level] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [history]);

    const triageCounts = useMemo(() => {
        const c = { Low: 0, Medium: 0, High: 0, Emergency: 0 };
        history.forEach(h => { if (c[h.triage_level] !== undefined) c[h.triage_level]++; });
        return c;
    }, [history]);

    // Time-of-day greeting
    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 17) return 'Good Afternoon';
        return 'Good Evening';
    }, []);

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div style={{
                    background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px', padding: '10px 14px', backdropFilter: 'blur(12px)',
                }}>
                    <p style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: 4 }}>{label}</p>
                    <p style={{ color: '#60a5fa', fontSize: '0.8125rem', margin: 0 }}>Risk: {payload[0].value}%</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="min-h-screen">
            {/* Header */}
            <header className="glass-card-static" style={{ borderRadius: 0, marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="container flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <Activity size={28} style={{ color: '#3b82f6' }} />
                        <span className="text-xl font-bold">
                            Stroke<span style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Triage</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <User size={18} className="text-muted" />
                            <span className="text-secondary">{user?.fullName}</span>
                        </div>
                        <button onClick={handleLogout} className="btn btn-secondary btn-sm">
                            <LogOut size={16} />
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            <div className="container">
                {/* Welcome Section */}
                <div className="mb-8 fade-in">
                    <p className="text-sm text-muted mb-1">{greeting}</p>
                    <h1 className="text-3xl font-bold mb-2">
                        Welcome back, <span style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{user?.fullName?.split(' ')[0]}</span>
                    </h1>
                    <p className="text-secondary">
                        Manage your health assessments and view triage recommendations.
                    </p>
                </div>

                {/* Stats Section */}
                <div className="section-header">
                    <div className="section-icon" style={{ background: 'rgba(59, 130, 246, 0.10)' }}>
                        <TrendingUp size={18} style={{ color: '#3b82f6' }} />
                    </div>
                    <h2>Overview</h2>
                </div>
                <div className="grid grid-cols-3 gap-6 mb-8">
                    {/* Total Assessments */}
                    <div className="glass-card-static slide-up" style={{ animationDelay: '0ms', borderTop: '3px solid #3b82f6' }}>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(59, 130, 246, 0.12)' }}>
                                <ClipboardList size={24} style={{ color: '#3b82f6' }} />
                            </div>
                            <div>
                                <p className="text-3xl font-bold" style={{ letterSpacing: '-0.02em' }}>{stats.total}</p>
                                <p className="text-sm text-secondary">Total Assessments</p>
                            </div>
                        </div>
                    </div>

                    {/* Avg Risk */}
                    <div className="glass-card-static slide-up" style={{ animationDelay: '100ms', borderTop: '3px solid #10b981' }}>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(16, 185, 129, 0.12)' }}>
                                <TrendingUp size={24} style={{ color: '#10b981' }} />
                            </div>
                            <div>
                                <p className="text-3xl font-bold" style={{ letterSpacing: '-0.02em' }}>{(stats.avgRisk * 100).toFixed(0)}%</p>
                                <p className="text-sm text-secondary">Average Risk Score</p>
                            </div>
                        </div>
                    </div>

                    {/* Latest Triage Level */}
                    <div className="glass-card-static slide-up" style={{ animationDelay: '200ms', borderTop: `3px solid ${TRIAGE_COLORS[stats.lastLevel] || '#f59e0b'}` }}>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(245, 158, 11, 0.12)' }}>
                                <Shield size={24} style={{ color: TRIAGE_COLORS[stats.lastLevel] || '#f59e0b' }} />
                            </div>
                            <div>
                                {stats.lastLevel ? (
                                    <TriageBadge level={stats.lastLevel} />
                                ) : (
                                    <p className="text-lg">No assessments</p>
                                )}
                                <p className="text-sm text-secondary mt-1">Latest Triage Level</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="divider" />

                {/* Quick Actions */}
                <div className="section-header">
                    <div className="section-icon" style={{ background: 'rgba(16, 185, 129, 0.10)' }}>
                        <ClipboardList size={18} style={{ color: '#10b981' }} />
                    </div>
                    <h2>Quick Actions</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <Link to="/patient/assessment" className="glass-card flex items-center gap-6 slide-up" style={{
                        animationDelay: '300ms',
                        transition: 'all 0.3s cubic-bezier(.4,0,.2,1)'
                    }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(59,130,246,0.15)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                            <ClipboardList size={32} style={{ color: '#3b82f6' }} />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold mb-1">New Assessment</h3>
                            <p className="text-secondary text-sm">Full clinical triage with risk factor analysis.</p>
                        </div>
                    </Link>

                    <Link to="/patient/assessment?step=3" className="glass-card flex items-center gap-6 slide-up" style={{
                        animationDelay: '350ms',
                        transition: 'all 0.3s cubic-bezier(.4,0,.2,1)'
                    }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(16,185,129,0.15)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                            <Mic size={32} style={{ color: '#10b981' }} />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold mb-1">Voice Triage</h3>
                            <p className="text-secondary text-sm">Upload speech sample for early neuro-warning analysis.</p>
                        </div>
                    </Link>
                </div>

                {/* ── Health Analytics Section ── */}
                {history.length >= 2 && (
                    <>
                        <div className="divider" />

                        <div className="section-header">
                            <div className="section-icon" style={{ background: 'rgba(139, 92, 246, 0.10)' }}>
                                <BarChart3 size={18} style={{ color: '#8b5cf6' }} />
                            </div>
                            <h2>Health Analytics</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            {/* Risk Score Trend */}
                            <div className="glass-card-static slide-up" style={{ animationDelay: '250ms' }}>
                                <h3 className="text-sm font-semibold text-secondary mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Score Trend</h3>
                                <div style={{ width: '100%', height: 220 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                            <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Area type="monotone" dataKey="risk" stroke="#3b82f6" strokeWidth={2.5} fill="url(#riskGradient)" dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#0f172a' }} activeDot={{ r: 6, fill: '#60a5fa', stroke: '#0f172a', strokeWidth: 2 }} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Triage Level Distribution */}
                            <div className="glass-card-static slide-up" style={{ animationDelay: '300ms' }}>
                                <h3 className="text-sm font-semibold text-secondary mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Triage Distribution</h3>
                                <div style={{ width: '100%', height: 220, display: 'flex', alignItems: 'center' }}>
                                    <ResponsiveContainer width="55%" height="100%">
                                        <PieChart>
                                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={4} dataKey="value" stroke="none">
                                                {pieData.map((entry, idx) => (
                                                    <Cell key={idx} fill={TRIAGE_COLORS[entry.name] || '#64748b'} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{
                                                    background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)',
                                                    borderRadius: '10px', fontSize: '0.8125rem'
                                                }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    {/* Legend */}
                                    <div style={{ flex: 1, paddingLeft: '0.5rem' }}>
                                        {Object.entries(triageCounts).filter(([, v]) => v > 0).map(([level, count]) => (
                                            <div key={level} className="flex items-center gap-2 mb-2.5">
                                                <div style={{ width: 10, height: 10, borderRadius: '3px', background: TRIAGE_COLORS[level], flexShrink: 0 }} />
                                                <span className="text-sm" style={{ flex: 1 }}>{level}</span>
                                                <span className="text-sm font-bold" style={{ color: TRIAGE_COLORS[level] }}>{count}</span>
                                            </div>
                                        ))}
                                        <div className="divider" style={{ margin: '0.75rem 0' }} />
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted">Total</span>
                                            <span className="text-sm font-bold" style={{ marginLeft: 'auto' }}>{history.length}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Upcoming Appointments */}
                {appointments.length > 0 && (
                    <div className="glass-card-static slide-up mb-8" style={{ animationDelay: '375ms' }}>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-semibold mb-0 flex items-center gap-2">
                                <Calendar size={20} style={{ color: '#3b82f6' }} />
                                Your Appointments
                            </h2>
                        </div>
                        <div className="space-y-3">
                            {appointments.map((appt) => (
                                <div
                                    key={appt.id}
                                    className="flex items-center justify-between p-4 rounded-lg"
                                    style={{ background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.12)' }}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl" style={{ background: 'rgba(59,130,246,0.12)' }}>
                                            👨‍⚕️
                                        </div>
                                        <div>
                                            <p className="font-semibold text-primary-600">Dr. {appt.doctor_name}</p>
                                            <p className="text-sm text-secondary">
                                                {appt.appointment_type === 'urgent' ? '🚨 Urgent Consultation' : 'Follow-up Appointment'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="flex items-center gap-2 justify-end text-lg font-bold">
                                            {new Date(appt.appointment_date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </div>
                                        <div className="flex items-center gap-1 justify-end text-sm text-secondary">
                                            <Clock size={14} />
                                            {appt.appointment_time} ({appt.duration_minutes} min)
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recent History */}
                <div className="divider" />

                <div className="glass-card-static slide-up" style={{ animationDelay: '400ms' }}>
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="section-icon" style={{ background: 'rgba(139, 92, 246, 0.10)', width: '32px', height: '32px', borderRadius: '8px' }}>
                                <Clock size={16} style={{ color: '#8b5cf6' }} />
                            </div>
                            <h2 className="text-xl font-semibold mb-0">Recent Assessments</h2>
                        </div>
                        {history.length > 5 && (
                            <button
                                onClick={() => setShowAllHistory(!showAllHistory)}
                                className="text-sm flex items-center gap-1"
                                style={{ color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                                {showAllHistory ? 'Show less' : 'View all'} <ChevronRight size={16} />
                            </button>
                        )}
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="spinner" />
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-8">
                            <ClipboardList size={48} className="mx-auto mb-4 text-muted" />
                            <p className="text-secondary mb-4">No assessments yet</p>
                            <Link to="/patient/assessment" className="btn btn-primary">
                                Start Your First Assessment
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {(showAllHistory ? history : history.slice(0, 5)).map((item) => (
                                <Link
                                    key={item.id}
                                    to={`/patient/result/${item.id}`}
                                    className="flex items-center justify-between p-4 rounded-lg transition-colors"
                                    style={{ background: 'rgba(99,102,241,0.05)' }}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(59, 130, 246, 0.12)' }}>
                                            <Activity size={20} style={{ color: '#3b82f6' }} />
                                        </div>
                                        <div>
                                            <p className="font-medium">Triage Assessment</p>
                                            <p className="text-sm text-muted">{formatDate(item.assessment_date)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <p className="text-sm text-secondary">Risk Score</p>
                                            <p className="font-semibold">{(item.risk_score * 100).toFixed(0)}%</p>
                                        </div>
                                        <TriageBadge level={item.triage_level} />
                                        <ChevronRight size={20} className="text-muted" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {/* Account Deletion Section */}
                <div className="glass-card-static slide-up mt-8" style={{ animationDelay: '500ms', borderLeft: '3px solid #ef4444' }}>
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="font-semibold flex items-center gap-2" style={{ color: '#dc2626' }}>
                                <Trash2 size={18} />
                                Account Deletion
                            </h3>
                            <p className="text-sm text-secondary mt-1">
                                Request permanent deletion of your account and all associated data.
                            </p>
                        </div>
                        {deletionStatus?.status === 'pending' ? (
                            <span className="px-3 py-1 rounded text-sm font-medium" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#d97706' }}>
                                Deletion Request Pending
                            </span>
                        ) : deletionStatus?.status === 'rejected' ? (
                            <div className="text-right">
                                <span className="px-3 py-1 rounded text-sm font-medium" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#dc2626' }}>
                                    Request Rejected
                                </span>
                                {deletionStatus.review_note && (
                                    <p className="text-xs text-muted mt-1">Note: {deletionStatus.review_note}</p>
                                )}
                                <button
                                    onClick={() => setShowDeleteModal(true)}
                                    className="btn btn-sm mt-2"
                                    style={{ background: 'rgba(239, 68, 68, 0.10)', color: '#dc2626' }}
                                >
                                    Request Again
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowDeleteModal(true)}
                                className="btn btn-sm"
                                style={{ background: 'rgba(239, 68, 68, 0.10)', color: '#dc2626' }}
                            >
                                <Trash2 size={14} />
                                Request Deletion
                            </button>
                        )}
                    </div>
                </div>

                {/* Delete Account Modal */}
                {showDeleteModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                        <div className="glass-card-static" style={{ maxWidth: '480px', width: '100%' }}>
                            <h3 className="text-lg font-semibold mb-4" style={{ color: '#dc2626' }}>⚠️ Request Account Deletion</h3>
                            <p className="text-secondary text-sm mb-4">
                                This will submit a request to permanently delete your account and all associated data
                                (assessments, triage results, audio recordings). This action cannot be undone once approved.
                            </p>
                            <div className="input-group mb-4">
                                <label className="input-label">Reason (optional)</label>
                                <textarea
                                    className="input"
                                    rows={3}
                                    placeholder="Why do you want to delete your account?"
                                    value={deleteReason}
                                    onChange={(e) => setDeleteReason(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => { setShowDeleteModal(false); setDeleteReason(''); }}
                                    className="btn btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRequestDeletion}
                                    className="btn"
                                    style={{ background: '#dc2626', color: '#fff' }}
                                    disabled={deleteLoading}
                                >
                                    {deleteLoading ? 'Submitting...' : 'Submit Deletion Request'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Disclaimer */}
                <div className="disclaimer mt-8 text-center">
                    <p className="text-sm">
                        ⚕️ This is a Clinical Decision Support System. All assessments should be reviewed
                        by qualified healthcare professionals. In case of emergency, call 911 immediately.
                    </p>
                </div>
            </div>
        </div>
    );
}
