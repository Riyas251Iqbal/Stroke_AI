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
    Mic,
    Trash2,
    Calendar,
    BarChart3,
    Heart,
    Droplet,
    Zap
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

function TriageBadge({ level }) {
    const config = {
        Low: { className: 'triage-badge-low', label: 'LOW' },
        Medium: { className: 'triage-badge-medium', label: 'MEDIUM' },
        High: { className: 'triage-badge-high', label: 'HIGH' },
        Emergency: { className: 'triage-badge-emergency', label: 'EMERGENCY' },
    };
    const { className, label } = config[level] || config.Low;
    return <span className={`triage-badge ${className}`}>{label}</span>;
}

export default function DoctorDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [cases, setCases] = useState([]);

    console.log('DoctorDashboard Render. Cases:', cases.length);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [refreshing, setRefreshing] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteReason, setDeleteReason] = useState('');
    const [deletionStatus, setDeletionStatus] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [appointments, setAppointments] = useState([]);

    useEffect(() => {
        fetchCases();
    }, [filter]);

    useEffect(() => {
        fetchDeletionStatus();
        fetchAppointments();
    }, []);

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

    // Group cases by patient
    const patientGroups = useMemo(() => {
        try {
            if (!cases || !Array.isArray(cases)) {
                console.warn('Cases is not an array:', cases);
                return [];
            }

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
                        max_priority: 0 // Track highest priority
                    };
                }
                groups[pid].assessments.push(c);

                // Update max priority for sorting
                const priorityScore = { 'Emergency': 4, 'High': 3, 'Medium': 2, 'Low': 1 }[c.triage_level] || 0;
                if (priorityScore > groups[pid].max_priority) {
                    groups[pid].max_priority = priorityScore;
                }
            });

            // Sort groups by max priority, then by date
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
    const TRIAGE_COLORS = { Emergency: '#ef4444', High: '#f97316', Medium: '#f59e0b', Low: '#10b981' };

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

    const pieLevelData = useMemo(() => {
        return triageBarData.filter(d => d.count > 0);
    }, [triageBarData]);

    const avgRiskScore = useMemo(() => {
        if (!safeCases.length) return 0;
        return Math.round(safeCases.reduce((sum, c) => sum + (c.risk_score || 0) * 100, 0) / safeCases.length);
    }, [safeCases]);

    const CustomBarTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div style={{
                    background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px', padding: '10px 14px', backdropFilter: 'blur(12px)',
                }}>
                    <p style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: 4 }}>{label}</p>
                    <p style={{ color: '#60a5fa', fontSize: '0.8125rem', margin: 0 }}>{payload[0].value} case{payload[0].value !== 1 ? 's' : ''}</p>
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
                        <span className="text-sm px-2 py-1 rounded" style={{ background: 'rgba(59, 130, 246, 0.10)', color: '#60a5fa' }}>
                            Clinical Dashboard
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <User size={18} className="text-muted" />
                            <span className="text-secondary">Dr. {user?.fullName}</span>
                        </div>
                        <button onClick={handleLogout} className="btn btn-secondary btn-sm">
                            <LogOut size={16} />
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            <div className="container">
                {/* Stats Section */}
                <div className="section-header">
                    <div className="section-icon" style={{ background: 'rgba(59, 130, 246, 0.10)' }}>
                        <Activity size={18} style={{ color: '#3b82f6' }} />
                    </div>
                    <h2>Triage Overview</h2>
                </div>
                <div className="grid grid-cols-4 gap-4 mb-8">
                    <div className="glass-card-static slide-up" style={{ borderTop: '3px solid #ef4444' }}>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239, 68, 68, 0.12)' }}>
                                <AlertTriangle size={20} style={{ color: '#ef4444' }} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{emergencyCases.length}</p>
                                <p className="text-xs text-secondary">Emergency</p>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card-static slide-up" style={{ animationDelay: '50ms', borderTop: '3px solid #f59e0b' }}>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(245, 158, 11, 0.12)' }}>
                                <Clock size={20} style={{ color: '#f59e0b' }} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{mediumCases.length}</p>
                                <p className="text-xs text-secondary">Medium Priority</p>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card-static slide-up" style={{ animationDelay: '100ms', borderTop: '3px solid #10b981' }}>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(16, 185, 129, 0.12)' }}>
                                <CheckCircle size={20} style={{ color: '#10b981' }} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{lowCases.length}</p>
                                <p className="text-xs text-secondary">Low Priority</p>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card-static slide-up" style={{ animationDelay: '150ms', borderTop: '3px solid #3b82f6' }}>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(59, 130, 246, 0.12)' }}>
                                <Users size={20} style={{ color: '#3b82f6' }} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{patientGroups.length}</p>
                                <p className="text-xs text-secondary">My Patients</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Patient Analytics Section ── */}
                {safeCases.length > 0 && (
                    <>
                        <div className="divider" />

                        <div className="section-header">
                            <div className="section-icon" style={{ background: 'rgba(139, 92, 246, 0.10)' }}>
                                <BarChart3 size={18} style={{ color: '#8b5cf6' }} />
                            </div>
                            <h2>Patient Analytics</h2>
                            <span className="text-sm text-muted" style={{ marginLeft: 'auto' }}>
                                {safeCases.length} assessment{safeCases.length !== 1 ? 's' : ''} · Avg Risk: {avgRiskScore}%
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            {/* Triage Level Distribution — Bar Chart */}
                            <div className="glass-card-static slide-up" style={{ animationDelay: '180ms' }}>
                                <h3 className="text-sm font-semibold text-secondary mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Case Distribution by Triage Level</h3>
                                <div style={{ width: '100%', height: 220 }}>
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

                            {/* Risk Factors Prevalence — Horizontal + Pie */}
                            <div className="glass-card-static slide-up" style={{ animationDelay: '250ms' }}>
                                <h3 className="text-sm font-semibold text-secondary mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Factors Prevalence</h3>
                                <div style={{ width: '100%', height: 220, display: 'flex', alignItems: 'center' }}>
                                    {/* Pie ring */}
                                    <ResponsiveContainer width="45%" height="100%">
                                        <PieChart>
                                            <Pie data={pieLevelData} cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={4} dataKey="count" stroke="none">
                                                {pieLevelData.map((entry, idx) => (
                                                    <Cell key={idx} fill={entry.fill} />
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
                                    {/* Risk Factor bars */}
                                    <div style={{ flex: 1, paddingLeft: '0.5rem' }}>
                                        {riskFactorsData.map(rf => {
                                            const pct = safeCases.length > 0 ? Math.round((rf.count / safeCases.length) * 100) : 0;
                                            return (
                                                <div key={rf.name} className="mb-3">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-xs text-secondary">{rf.name}</span>
                                                        <span className="text-xs font-bold">{rf.count} <span className="text-muted">({pct}%)</span></span>
                                                    </div>
                                                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                                                        <div style={{
                                                            width: `${pct}%`, height: '100%', borderRadius: 3,
                                                            background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                                                            transition: 'width 0.5s ease'
                                                        }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                <div className="divider" />

                {/* ── Pending Reviews & Appointments — Side by Side ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', marginBottom: '2rem' }}>

                    {/* Pending Cases */}
                    <div className="glass-card-static slide-up" style={{ animationDelay: '200ms' }}>
                        <div className="flex justify-between items-center mb-5" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                            <div className="flex items-center gap-3">
                                <div className="section-icon" style={{ background: 'rgba(245, 158, 11, 0.10)', width: '32px', height: '32px', borderRadius: '8px' }}>
                                    <Clock size={16} style={{ color: '#f59e0b' }} />
                                </div>
                                <h2 className="text-xl font-semibold mb-0">Pending Reviews</h2>
                                <span className="text-xs px-2 py-1 rounded font-bold" style={{ background: 'rgba(245, 158, 11, 0.10)', color: '#f59e0b' }}>
                                    {safeCases.length} case{safeCases.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Filter size={14} className="text-muted" />
                                <select
                                    className="select"
                                    style={{ width: 'auto', padding: '0.4rem 1.8rem 0.4rem 0.6rem', fontSize: '0.8125rem' }}
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
                                    style={{ padding: '0.4rem 0.55rem' }}
                                >
                                    <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-12">
                                <div className="spinner" />
                            </div>
                        ) : patientGroups.length === 0 ? (
                            <div className="text-center py-10">
                                <CheckCircle size={44} className="mx-auto mb-3" style={{ color: '#10b981' }} />
                                <p className="text-lg font-medium mb-1">All caught up!</p>
                                <p className="text-secondary text-sm">No pending cases to review.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {patientGroups.map((group) => {
                                    const latestCase = group.assessments[0];
                                    const isEmergency = group.assessments.some(c => c.triage_level === 'Emergency');
                                    const pendingCount = group.assessments.length;

                                    return (
                                        <div
                                            key={group.patient_id}
                                            className="rounded-xl transition-all"
                                            style={{
                                                background: isEmergency ? 'rgba(239, 68, 68, 0.06)' : 'rgba(255,255,255,0.03)',
                                                border: isEmergency ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(255,255,255,0.06)',
                                            }}
                                        >
                                            {/* Patient Header */}
                                            <div
                                                className="cursor-pointer"
                                                style={{ padding: '1rem 1.25rem', transition: 'background 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                onClick={() => toggleExpand(group.patient_id)}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', minWidth: 0 }}>
                                                    <div className="relative" style={{ flexShrink: 0 }}>
                                                        <div
                                                            style={{
                                                                width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontSize: '1rem', fontWeight: 700, color: '#fff',
                                                                background: 'linear-gradient(135deg, #6366f1, #4f46e5)'
                                                            }}
                                                        >
                                                            {latestCase.patient_name?.charAt(0) || 'P'}
                                                        </div>
                                                        {pendingCount > 1 && (
                                                            <div style={{ position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: '0.625rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(15,23,42,0.8)' }}>
                                                                {pendingCount}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.125rem', flexWrap: 'wrap' }}>
                                                            <h3 style={{ fontWeight: 700, fontSize: '1rem', margin: 0, whiteSpace: 'nowrap' }}>{latestCase.patient_name}</h3>
                                                            {isEmergency && (
                                                                <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: '0.625rem', fontWeight: 700, background: 'rgba(239,68,68,0.15)', color: '#f87171', display: 'inline-flex', alignItems: 'center', gap: 3 }} className="animate-pulse">
                                                                    🚑 EMERGENCY
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-secondary" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                                                            <span>Age: {latestCase.age}</span>
                                                            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
                                                            <span style={{ color: '#818cf8', fontWeight: 600 }}>{pendingCount} pending</span>
                                                        </p>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                                                    <TriageBadge level={latestCase.triage_level} />
                                                    <ChevronRight
                                                        size={20}
                                                        className={`text-muted transition-transform duration-200 ${expandedPatientId === group.patient_id ? 'rotate-90' : ''}`}
                                                    />
                                                </div>
                                            </div>

                                            {/* Expanded Assessments */}
                                            {expandedPatientId === group.patient_id && (
                                                <div style={{ padding: '0.75rem 1.25rem 1rem', borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    {group.assessments.map((caseItem) => (
                                                        <div
                                                            key={caseItem.id}
                                                            style={{ padding: '0.75rem 1rem', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}
                                                        >
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 4, flexWrap: 'wrap' }}>
                                                                    <TriageBadge level={caseItem.triage_level} />
                                                                    <span className="text-sm text-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                                        <Calendar size={11} />
                                                                        {formatDate(caseItem.assessment_date)}
                                                                    </span>
                                                                    <span className="text-sm font-semibold" style={{ color: '#60a5fa' }}>
                                                                        {(caseItem.risk_score * 100).toFixed(0)}% risk
                                                                    </span>
                                                                </div>
                                                                <div className="text-xs text-secondary" style={{ lineHeight: 1.5 }}>
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
                                                                className="btn btn-primary btn-sm flex items-center gap-1 group"
                                                                style={{ flexShrink: 0, fontSize: '0.8125rem' }}
                                                            >
                                                                Review
                                                                <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
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

                    {/* Upcoming Appointments */}
                    <div className="glass-card-static slide-up" style={{ animationDelay: '350ms' }}>
                        <div className="flex justify-between items-center mb-5" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                            <div className="flex items-center gap-3">
                                <div className="section-icon" style={{ background: 'rgba(59, 130, 246, 0.10)', width: '32px', height: '32px', borderRadius: '8px' }}>
                                    <Calendar size={16} style={{ color: '#3b82f6' }} />
                                </div>
                                <h2 className="text-xl font-semibold mb-0">Upcoming Appointments</h2>
                            </div>
                            <span className="text-xs px-2 py-1 rounded font-bold" style={{ background: 'rgba(59, 130, 246, 0.10)', color: '#60a5fa' }}>
                                {appointments.length} scheduled
                            </span>
                        </div>

                        {(!appointments || !Array.isArray(appointments) || appointments.length === 0) ? (
                            <div className="text-center py-10">
                                <Calendar size={40} className="mx-auto mb-3" style={{ color: 'rgba(99,102,241,0.3)' }} />
                                <p className="text-muted" style={{ marginBottom: 2 }}>No upcoming appointments.</p>
                                <p className="text-sm text-muted">Schedule appointments from case review pages.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {appointments.map((appt) => {
                                    const priorityColors = {
                                        critical: { bg: 'rgba(239, 68, 68, 0.10)', color: '#dc2626', label: 'CRITICAL' },
                                        high: { bg: 'rgba(249, 115, 22, 0.10)', color: '#ea580c', label: 'HIGH' },
                                        normal: { bg: 'rgba(59, 130, 246, 0.10)', color: '#2563eb', label: 'NORMAL' },
                                        low: { bg: 'rgba(16, 185, 129, 0.10)', color: '#059669', label: 'LOW' }
                                    };
                                    const p = priorityColors[appt.priority] || priorityColors.normal;
                                    const typeLabels = { urgent: '🚨 Urgent', follow_up: '🔄 Follow-up', consultation: '💬 Consultation', routine: '✅ Routine' };

                                    return (
                                        <div
                                            key={appt.id}
                                            style={{
                                                padding: '0.875rem 1rem',
                                                borderRadius: 12,
                                                background: 'rgba(99,102,241,0.04)',
                                                border: '1px solid rgba(99,102,241,0.10)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                gap: '0.75rem', flexWrap: 'wrap',
                                                transition: 'background 0.15s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.07)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.04)'}
                                        >
                                            {/* Left: avatar + info */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                                                <div
                                                    style={{
                                                        width: 40, height: 40, borderRadius: '50%',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: '0.9375rem', fontWeight: 600,
                                                        background: p.bg, color: p.color, flexShrink: 0
                                                    }}
                                                >
                                                    {appt.patient_name?.charAt(0) || 'P'}
                                                </div>
                                                <div style={{ minWidth: 0 }}>
                                                    <p style={{ fontWeight: 600, fontSize: '0.875rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{appt.patient_name}</p>
                                                    <p className="text-muted" style={{ fontSize: '0.75rem', margin: 0 }}>
                                                        {typeLabels[appt.appointment_type] || appt.appointment_type} · {appt.duration_minutes}m
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Right: date + actions */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
                                                <div style={{ textAlign: 'right' }}>
                                                    <p style={{ fontWeight: 600, fontSize: '0.8125rem', margin: 0 }}>
                                                        {new Date(appt.appointment_date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                    </p>
                                                    <p className="text-muted" style={{ fontSize: '0.6875rem', margin: 0 }}>{appt.appointment_time}</p>
                                                </div>
                                                <span style={{ fontSize: '0.625rem', padding: '2px 6px', borderRadius: 20, fontWeight: 700, background: p.bg, color: p.color }}>
                                                    {p.label}
                                                </span>
                                                <button
                                                    onClick={() => handleCompleteAppointment(appt.id)}
                                                    className="btn btn-sm"
                                                    style={{ background: 'rgba(16, 185, 129, 0.10)', color: '#059669', padding: '0.3rem 0.5rem', lineHeight: 1 }}
                                                    title="Mark as completed"
                                                >
                                                    <CheckCircle size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
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
                {
                    showDeleteModal && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                            <div className="glass-card-static" style={{ maxWidth: '480px', width: '100%' }}>
                                <h3 className="text-lg font-semibold mb-4" style={{ color: '#dc2626' }}>⚠️ Request Account Deletion</h3>
                                <p className="text-secondary text-sm mb-4">
                                    This will submit a request to permanently delete your account and all associated data.
                                    This action cannot be undone once approved by an admin.
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
                    )
                }

                {/* Clinical Reminder */}
                <div className="disclaimer mt-8">
                    <p className="text-sm text-center">
                        ⚕️ Clinical Decision Support System. All assessments require clinical validation.
                        This tool assists triage prioritization but does not replace physician judgment.
                    </p>
                </div>
            </div >
        </div >
    );
}
