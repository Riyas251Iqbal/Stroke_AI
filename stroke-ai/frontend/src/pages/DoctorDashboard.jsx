/**
 * Doctor Dashboard
 * Pending cases queue with priority sorting and review workflow
 */

import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { triageAPI, adminAPI, appointmentAPI } from '../services/api';
import {
    Activity,
    Users,
    AlertTriangle,
    Clock,
    CheckCircle,
    ChevronRight,
    LogOut,
    User,
    Filter,
    RefreshCw,
    Trash2,
    Calendar,
    BarChart3,
    Stethoscope,
    Shield,
    TrendingUp,
    ChevronDown,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

function TriageBadge({ level }) {
    const config = {
        Low: { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981', label: 'LOW' },
        Medium: { bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', label: 'MEDIUM' },
        High: { bg: 'rgba(249, 115, 22, 0.12)', color: '#f97316', label: 'HIGH' },
        Emergency: { bg: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', label: 'EMERGENCY' },
    };
    const c = config[level] || config.Low;
    return (
        <span style={{
            padding: '3px 10px', borderRadius: 20, fontSize: '0.6875rem',
            fontWeight: 700, letterSpacing: '0.04em',
            background: c.bg, color: c.color, whiteSpace: 'nowrap',
        }}>
            {c.label}
        </span>
    );
}

export default function DoctorDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [cases, setCases] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [refreshing, setRefreshing] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteReason, setDeleteReason] = useState('');
    const [deletionStatus, setDeletionStatus] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [appointments, setAppointments] = useState([]);

    useEffect(() => { fetchCases(); }, [filter]);
    useEffect(() => { fetchDeletionStatus(); fetchAppointments(); }, []);

    const fetchCases = async () => {
        try {
            const [casesRes, statsRes] = await Promise.all([
                triageAPI.getPendingCases(filter !== 'all' ? { triage_level: filter } : {}),
                adminAPI.getStats()
            ]);
            setCases(casesRes.data.pending_cases || []);
            setStats(statsRes.data.stats);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
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

    const handleRefresh = () => {
        setRefreshing(true);
        fetchCases();
        fetchAppointments();
    };

    const fetchAppointments = async () => {
        try {
            const res = await appointmentAPI.list({ status: 'scheduled' });
            setAppointments(res.data.appointments || []);
        } catch (e) {
            console.error('Error fetching appointments:', e);
        }
    };

    const handleCompleteAppointment = async (id) => {
        try {
            await appointmentAPI.update(id, { status: 'completed' });
            fetchAppointments();
        } catch (e) {
            console.error('Failed to complete appointment:', e);
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor(diff / (1000 * 60));
        if (mins < 60) return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const safeCases = Array.isArray(cases) ? cases : [];
    const emergencyCases = safeCases.filter(c => c.triage_level === 'Emergency');
    const highCases = safeCases.filter(c => c.triage_level === 'High');
    const mediumCases = safeCases.filter(c => c.triage_level === 'Medium');
    const lowCases = safeCases.filter(c => c.triage_level === 'Low');

    const [expandedPatientId, setExpandedPatientId] = useState(null);

    const patientGroups = useMemo(() => {
        try {
            if (!cases || !Array.isArray(cases)) return [];
            const groups = {};
            cases.forEach(c => {
                if (!c) return;
                const pid = c.patient_id || 'unknown';
                if (!groups[pid]) {
                    groups[pid] = {
                        patient_id: pid,
                        patient_name: c.patient_name || 'Unknown',
                        age: c.age,
                        assessments: [],
                        max_priority: 0
                    };
                }
                groups[pid].assessments.push(c);
                const priorityScore = { 'Emergency': 4, 'High': 3, 'Medium': 2, 'Low': 1 }[c.triage_level] || 0;
                if (priorityScore > groups[pid].max_priority) {
                    groups[pid].max_priority = priorityScore;
                }
            });
            return Object.values(groups).sort((a, b) => b.max_priority - a.max_priority);
        } catch (e) {
            console.error('Error in patient grouping:', e);
            return [];
        }
    }, [cases]);

    const toggleExpand = (patientId) => {
        setExpandedPatientId(expandedPatientId === patientId ? null : patientId);
    };

    // ── Chart Data ──
    const triageBarData = useMemo(() => [
        { name: 'Emergency', count: emergencyCases.length, fill: '#ef4444' },
        { name: 'High', count: highCases.length, fill: '#f97316' },
        { name: 'Medium', count: mediumCases.length, fill: '#f59e0b' },
        { name: 'Low', count: lowCases.length, fill: '#10b981' },
    ], [emergencyCases, highCases, mediumCases, lowCases]);

    const riskFactorsData = useMemo(() => {
        const rf = { Hypertension: 0, Diabetes: 0, 'Heart Disease': 0, 'Voice Anomaly': 0 };
        safeCases.forEach(c => {
            if (c.hypertension) rf.Hypertension++;
            if (c.diabetes) rf.Diabetes++;
            if (c.heart_disease) rf['Heart Disease']++;
            if (c.audio_filename) rf['Voice Anomaly']++;
        });
        return Object.entries(rf).map(([name, count]) => ({ name, count }));
    }, [safeCases]);

    const pieLevelData = useMemo(() => triageBarData.filter(d => d.count > 0), [triageBarData]);

    const avgRiskScore = useMemo(() => {
        if (!safeCases.length) return 0;
        return Math.round(safeCases.reduce((sum, c) => sum + (c.risk_score || 0) * 100, 0) / safeCases.length);
    }, [safeCases]);

    const CustomBarTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div style={{
                    background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10, padding: '10px 14px', backdropFilter: 'blur(12px)',
                }}>
                    <p style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: 4 }}>{label}</p>
                    <p style={{ color: '#60a5fa', fontSize: '0.8125rem', margin: 0 }}>{payload[0].value} case{payload[0].value !== 1 ? 's' : ''}</p>
                </div>
            );
        }
        return null;
    };

    // ── Priority colors for appointments ──
    const priorityConfig = {
        critical: { bg: 'rgba(239, 68, 68, 0.10)', color: '#ef4444', label: 'CRITICAL' },
        high: { bg: 'rgba(249, 115, 22, 0.10)', color: '#f97316', label: 'HIGH' },
        normal: { bg: 'rgba(59, 130, 246, 0.10)', color: '#3b82f6', label: 'NORMAL' },
        low: { bg: 'rgba(16, 185, 129, 0.10)', color: '#10b981', label: 'LOW' },
    };
    const typeLabels = { urgent: '🚨 Urgent', follow_up: '🔄 Follow-up', consultation: '💬 Consult', routine: '✅ Routine' };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
            {/* ═══════════════════════ HEADER ═══════════════════════ */}
            <header style={{
                padding: '1rem 2rem',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(15, 23, 42, 0.6)',
                backdropFilter: 'blur(16px)',
                position: 'sticky', top: 0, zIndex: 50,
            }}>
                <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 12,
                            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Stethoscope size={22} style={{ color: '#fff' }} />
                        </div>
                        <div>
                            <span style={{ fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                                Stroke<span style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Triage</span>
                            </span>
                            <span style={{
                                marginLeft: 10, fontSize: '0.6875rem', fontWeight: 600,
                                padding: '2px 8px', borderRadius: 6,
                                background: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa',
                            }}>
                                DOCTOR
                            </span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{
                                width: 34, height: 34, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.8125rem', fontWeight: 700, color: '#fff',
                            }}>
                                {user?.fullName?.charAt(0) || 'D'}
                            </div>
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Dr. {user?.fullName}</span>
                        </div>
                        <button onClick={handleLogout} className="btn btn-secondary btn-sm" style={{ gap: '0.375rem' }}>
                            <LogOut size={15} />
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 2rem 3rem' }}>
                {/* ═══════════════════════ WELCOME + QUICK STATS ═══════════════════════ */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.25rem' }}>
                        Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, Dr. {user?.fullName?.split(' ')[0]}
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
                        {safeCases.length} pending assessment{safeCases.length !== 1 ? 's' : ''} · {appointments.length} upcoming appointment{appointments.length !== 1 ? 's' : ''}
                    </p>
                </div>

                {/* ═══════════════════════ STAT CARDS ═══════════════════════ */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                    {[
                        { label: 'Emergency', count: emergencyCases.length, icon: AlertTriangle, color: '#ef4444', delay: '0ms' },
                        { label: 'High Risk', count: highCases.length, icon: TrendingUp, color: '#f97316', delay: '50ms' },
                        { label: 'Medium', count: mediumCases.length, icon: Clock, color: '#f59e0b', delay: '100ms' },
                        { label: 'Low Risk', count: lowCases.length, icon: Shield, color: '#10b981', delay: '150ms' },
                    ].map(stat => (
                        <div
                            key={stat.label}
                            className="slide-up"
                            style={{
                                animationDelay: stat.delay,
                                padding: '1.25rem',
                                borderRadius: 16,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderTop: `3px solid ${stat.color}`,
                                transition: 'transform 0.2s, box-shadow 0.2s',
                                cursor: 'default',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${stat.color}15`; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: 12,
                                    background: `${stat.color}15`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    <stat.icon size={22} style={{ color: stat.color }} />
                                </div>
                                <div>
                                    <p style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, lineHeight: 1.1 }}>{stat.count}</p>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, fontWeight: 500 }}>{stat.label}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ═══════════════════════ ANALYTICS ═══════════════════════ */}
                {safeCases.length > 0 && (
                    <div style={{ marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: 8,
                                    background: 'rgba(139, 92, 246, 0.12)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <BarChart3 size={16} style={{ color: '#8b5cf6' }} />
                                </div>
                                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>Patient Analytics</h2>
                            </div>
                            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                                {safeCases.length} assessment{safeCases.length !== 1 ? 's' : ''} · Avg Risk: {avgRiskScore}%
                            </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            {/* Bar Chart */}
                            <div className="slide-up" style={{
                                animationDelay: '180ms',
                                padding: '1.5rem',
                                borderRadius: 16,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}>
                                <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
                                    Case Distribution
                                </h3>
                                <div style={{ width: '100%', height: 200 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={triageBarData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                            <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                            <Tooltip content={<CustomBarTooltip />} />
                                            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                                {triageBarData.map((entry, idx) => (
                                                    <Cell key={idx} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Pie + Risk Factors */}
                            <div className="slide-up" style={{
                                animationDelay: '250ms',
                                padding: '1.5rem',
                                borderRadius: 16,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}>
                                <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
                                    Risk Factors
                                </h3>
                                <div style={{ width: '100%', height: 200, display: 'flex', alignItems: 'center' }}>
                                    <ResponsiveContainer width="42%" height="100%">
                                        <PieChart>
                                            <Pie data={pieLevelData} cx="50%" cy="50%" innerRadius={36} outerRadius={62} paddingAngle={4} dataKey="count" stroke="none">
                                                {pieLevelData.map((entry, idx) => (
                                                    <Cell key={idx} fill={entry.fill} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={{
                                                background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: 10, fontSize: '0.8125rem'
                                            }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div style={{ flex: 1, paddingLeft: '0.75rem' }}>
                                        {riskFactorsData.map(rf => {
                                            const pct = safeCases.length > 0 ? Math.round((rf.count / safeCases.length) * 100) : 0;
                                            return (
                                                <div key={rf.name} style={{ marginBottom: '0.75rem' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{rf.name}</span>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{rf.count} <span style={{ color: 'var(--text-muted)' }}>({pct}%)</span></span>
                                                    </div>
                                                    <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                                                        <div style={{
                                                            width: `${pct}%`, height: '100%', borderRadius: 3,
                                                            background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                                                            transition: 'width 0.6s ease',
                                                        }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════ TWO-COLUMN: REVIEWS + APPOINTMENTS ═══════════════════════ */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.25rem', marginBottom: '2rem' }}>

                    {/* ── Pending Reviews ── */}
                    <div style={{
                        padding: '1.5rem',
                        borderRadius: 16,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                    }} className="slide-up" >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: 8,
                                    background: 'rgba(245, 158, 11, 0.12)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Clock size={16} style={{ color: '#f59e0b' }} />
                                </div>
                                <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, margin: 0 }}>Pending Reviews</h2>
                                <span style={{
                                    fontSize: '0.6875rem', fontWeight: 700,
                                    padding: '2px 8px', borderRadius: 20,
                                    background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b',
                                }}>
                                    {safeCases.length}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Filter size={13} style={{ color: 'var(--text-muted)' }} />
                                <select
                                    className="select"
                                    style={{ width: 'auto', padding: '0.35rem 1.6rem 0.35rem 0.5rem', fontSize: '0.8125rem' }}
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                >
                                    <option value="all">All Levels</option>
                                    <option value="Emergency">Emergency</option>
                                    <option value="High">High</option>
                                    <option value="Medium">Medium</option>
                                    <option value="Low">Low</option>
                                </select>
                                <button
                                    onClick={handleRefresh}
                                    className="btn btn-secondary btn-sm"
                                    disabled={refreshing}
                                    style={{ padding: '0.35rem 0.45rem' }}
                                >
                                    <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                                <div className="spinner" style={{ margin: '0 auto 1rem' }} />
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading cases...</p>
                            </div>
                        ) : patientGroups.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                                <CheckCircle size={40} style={{ color: '#10b981', margin: '0 auto 0.75rem', display: 'block' }} />
                                <p style={{ fontWeight: 600, marginBottom: 4 }}>All caught up!</p>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>No pending cases to review.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                {patientGroups.map(group => {
                                    const latestCase = group.assessments[0];
                                    const isEmergency = group.assessments.some(c => c.triage_level === 'Emergency');
                                    const pendingCount = group.assessments.length;
                                    const isExpanded = expandedPatientId === group.patient_id;

                                    return (
                                        <div
                                            key={group.patient_id}
                                            style={{
                                                borderRadius: 14,
                                                overflow: 'hidden',
                                                background: isEmergency ? 'rgba(239, 68, 68, 0.04)' : 'rgba(255,255,255,0.02)',
                                                border: isEmergency ? '1px solid rgba(239, 68, 68, 0.15)' : '1px solid rgba(255,255,255,0.05)',
                                                transition: 'border-color 0.2s',
                                            }}
                                        >
                                            {/* Patient row */}
                                            <div
                                                onClick={() => toggleExpand(group.patient_id)}
                                                style={{
                                                    padding: '0.875rem 1rem',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    gap: '0.75rem', cursor: 'pointer',
                                                    transition: 'background 0.15s',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                                                    <div style={{ position: 'relative', flexShrink: 0 }}>
                                                        <div style={{
                                                            width: 40, height: 40, borderRadius: '50%',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: '0.9375rem', fontWeight: 700, color: '#fff',
                                                            background: isEmergency
                                                                ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                                                                : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                                        }}>
                                                            {latestCase.patient_name?.charAt(0) || 'P'}
                                                        </div>
                                                        {pendingCount > 1 && (
                                                            <div style={{
                                                                position: 'absolute', top: -3, right: -3,
                                                                width: 18, height: 18, borderRadius: '50%',
                                                                background: '#ef4444', color: '#fff',
                                                                fontSize: '0.5625rem', fontWeight: 700,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                border: '2px solid rgba(15,23,42,0.9)',
                                                            }}>
                                                                {pendingCount}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                            <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{latestCase.patient_name}</span>
                                                            {isEmergency && (
                                                                <span className="animate-pulse" style={{
                                                                    padding: '1px 6px', borderRadius: 4,
                                                                    fontSize: '0.5625rem', fontWeight: 700,
                                                                    background: 'rgba(239,68,68,0.15)', color: '#f87171',
                                                                }}>
                                                                    🚑 URGENT
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                            Age: {latestCase.age} · <span style={{ color: '#818cf8', fontWeight: 600 }}>{pendingCount} pending</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
                                                    <TriageBadge level={latestCase.triage_level} />
                                                    <ChevronDown
                                                        size={18}
                                                        style={{
                                                            color: 'var(--text-muted)',
                                                            transition: 'transform 0.2s',
                                                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Expanded assessments */}
                                            {isExpanded && (
                                                <div style={{
                                                    padding: '0.625rem 1rem 0.875rem',
                                                    borderTop: '1px solid rgba(255,255,255,0.04)',
                                                    background: 'rgba(255,255,255,0.015)',
                                                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                                                }}>
                                                    {group.assessments.map(caseItem => (
                                                        <div
                                                            key={caseItem.id}
                                                            style={{
                                                                padding: '0.75rem 0.875rem',
                                                                borderRadius: 10,
                                                                background: 'rgba(255,255,255,0.03)',
                                                                border: '1px solid rgba(255,255,255,0.05)',
                                                                display: 'flex', justifyContent: 'space-between',
                                                                alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap',
                                                            }}
                                                        >
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: 3 }}>
                                                                    <TriageBadge level={caseItem.triage_level} />
                                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                                        <Calendar size={11} /> {formatDate(caseItem.assessment_date)}
                                                                    </span>
                                                                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#60a5fa' }}>
                                                                        {(caseItem.risk_score * 100).toFixed(0)}% risk
                                                                    </span>
                                                                </div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                    {[
                                                                        caseItem.hypertension && 'Hypertension',
                                                                        caseItem.diabetes && 'Diabetes',
                                                                        caseItem.heart_disease && 'Heart Disease',
                                                                        caseItem.audio_filename && 'Voice Anomalies'
                                                                    ].filter(Boolean).join(' · ') || 'No risk factors'}
                                                                </div>
                                                            </div>
                                                            <Link
                                                                to={`/doctor/review/${caseItem.id}`}
                                                                className="btn btn-primary btn-sm"
                                                                style={{ flexShrink: 0, fontSize: '0.8125rem', gap: '0.25rem' }}
                                                            >
                                                                Review <ChevronRight size={14} />
                                                            </Link>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── Appointments ── */}
                    <div style={{
                        padding: '1.5rem',
                        borderRadius: 16,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                    }} className="slide-up" >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: 8,
                                    background: 'rgba(59, 130, 246, 0.12)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Calendar size={16} style={{ color: '#3b82f6' }} />
                                </div>
                                <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, margin: 0 }}>Appointments</h2>
                            </div>
                            <span style={{
                                fontSize: '0.6875rem', fontWeight: 700,
                                padding: '2px 8px', borderRadius: 20,
                                background: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa',
                            }}>
                                {appointments.length}
                            </span>
                        </div>

                        {(!appointments || !Array.isArray(appointments) || appointments.length === 0) ? (
                            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                                <Calendar size={36} style={{ color: 'rgba(99,102,241,0.25)', margin: '0 auto 0.75rem', display: 'block' }} />
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: 4 }}>No upcoming appointments.</p>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Schedule from case reviews.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {appointments.map(appt => {
                                    const p = priorityConfig[appt.priority] || priorityConfig.normal;
                                    return (
                                        <div
                                            key={appt.id}
                                            style={{
                                                padding: '0.875rem',
                                                borderRadius: 12,
                                                background: 'rgba(255,255,255,0.02)',
                                                border: '1px solid rgba(255,255,255,0.05)',
                                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.05)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                        >
                                            <div style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.8125rem', fontWeight: 600,
                                                background: p.bg, color: p.color, flexShrink: 0,
                                            }}>
                                                {appt.patient_name?.charAt(0) || 'P'}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ fontWeight: 600, fontSize: '0.8125rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {appt.patient_name}
                                                </p>
                                                <p style={{ color: 'var(--text-muted)', fontSize: '0.6875rem', margin: 0 }}>
                                                    {typeLabels[appt.appointment_type] || appt.appointment_type} · {appt.duration_minutes}m
                                                </p>
                                            </div>
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <p style={{ fontWeight: 600, fontSize: '0.75rem', margin: 0 }}>
                                                    {new Date(appt.appointment_date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </p>
                                                <p style={{ color: 'var(--text-muted)', fontSize: '0.625rem', margin: 0 }}>{appt.appointment_time}</p>
                                            </div>
                                            <button
                                                onClick={() => handleCompleteAppointment(appt.id)}
                                                title="Mark completed"
                                                style={{
                                                    background: 'rgba(16, 185, 129, 0.12)', color: '#10b981',
                                                    border: 'none', borderRadius: 8,
                                                    padding: '0.35rem', cursor: 'pointer', flexShrink: 0,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    transition: 'background 0.15s',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.12)'}
                                            >
                                                <CheckCircle size={15} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══════════════════════ ACCOUNT DELETION ═══════════════════════ */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderRadius: 16,
                    background: 'rgba(239, 68, 68, 0.03)',
                    border: '1px solid rgba(239, 68, 68, 0.1)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem',
                }}>
                    <div>
                        <h3 style={{ fontWeight: 600, fontSize: '0.9375rem', margin: '0 0 0.25rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Trash2 size={16} /> Account Deletion
                        </h3>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
                            Request permanent deletion of your account and all associated data.
                        </p>
                    </div>
                    {deletionStatus?.status === 'pending' ? (
                        <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, background: 'rgba(245, 158, 11, 0.12)', color: '#d97706' }}>
                            Pending Review
                        </span>
                    ) : deletionStatus?.status === 'rejected' ? (
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, background: 'rgba(239, 68, 68, 0.12)', color: '#dc2626' }}>
                                Rejected
                            </span>
                            {deletionStatus.review_note && (
                                <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 4 }}>Note: {deletionStatus.review_note}</p>
                            )}
                            <button onClick={() => setShowDeleteModal(true)} style={{
                                marginTop: 6, background: 'rgba(239, 68, 68, 0.10)', color: '#dc2626',
                                border: 'none', padding: '4px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                            }}>
                                Request Again
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => setShowDeleteModal(true)} style={{
                            background: 'rgba(239, 68, 68, 0.10)', color: '#dc2626',
                            border: 'none', padding: '0.4rem 0.875rem', borderRadius: 10, cursor: 'pointer',
                            fontSize: '0.8125rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.375rem',
                            transition: 'background 0.15s',
                        }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.18)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.10)'}
                        >
                            <Trash2 size={14} /> Request Deletion
                        </button>
                    )}
                </div>

                {/* ── Delete Modal ── */}
                {showDeleteModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                        <div style={{
                            maxWidth: 460, width: '100%',
                            padding: '2rem',
                            borderRadius: 20,
                            background: 'rgba(15, 23, 42, 0.95)',
                            border: '1px solid rgba(255,255,255,0.08)',
                        }}>
                            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.75rem', color: '#dc2626' }}>⚠️ Request Account Deletion</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
                                This will submit a request to permanently delete your account. This action cannot be undone once approved.
                            </p>
                            <div className="input-group" style={{ marginBottom: '1.25rem' }}>
                                <label className="input-label">Reason (optional)</label>
                                <textarea
                                    className="input"
                                    rows={3}
                                    placeholder="Why do you want to delete your account?"
                                    value={deleteReason}
                                    onChange={(e) => setDeleteReason(e.target.value)}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                                <button onClick={() => { setShowDeleteModal(false); setDeleteReason(''); }} className="btn btn-secondary">
                                    Cancel
                                </button>
                                <button onClick={handleRequestDeletion} disabled={deleteLoading}
                                    style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
                                    {deleteLoading ? 'Submitting...' : 'Submit Request'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Footer ── */}
                <div style={{
                    textAlign: 'center', padding: '1rem',
                    borderRadius: 12,
                    background: 'rgba(99,102,241,0.04)',
                    border: '1px solid rgba(99,102,241,0.08)',
                }}>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
                        ⚕️ Clinical Decision Support System · All assessments require clinical validation · Does not replace physician judgment
                    </p>
                </div>
            </div>
        </div>
    );
}
