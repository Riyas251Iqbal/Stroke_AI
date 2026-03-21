/**
 * Doctor Review Page
 * Case detail view with review/notes form for doctor
 */

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { triageAPI, appointmentAPI } from '../services/api';
import {
    ArrowLeft,
    AlertTriangle,
    CheckCircle,
    Clock,
    User,
    FileText,
    Send,
    Activity,
    Mic,
    Calendar,
    Camera,
    Eye,
    Shield,
    Heart,
    Stethoscope,
    ChevronDown,
} from 'lucide-react';

function TriageBadge({ level }) {
    const config = {
        Low: { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981', label: 'LOW RISK' },
        Medium: { bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', label: 'MEDIUM RISK' },
        High: { bg: 'rgba(249, 115, 22, 0.12)', color: '#f97316', label: 'HIGH RISK' },
        Emergency: { bg: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', label: 'EMERGENCY' },
    };
    const c = config[level] || config.Low;
    return (
        <span style={{
            padding: '4px 12px', borderRadius: 20, fontSize: '0.6875rem',
            fontWeight: 700, letterSpacing: '0.04em',
            background: c.bg, color: c.color, whiteSpace: 'nowrap',
        }}>
            {c.label}
        </span>
    );
}

/* ─── Reusable info card ─── */
const cardStyle = {
    padding: '1.5rem',
    borderRadius: 16,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
};

const SectionTitle = ({ icon: Icon, color, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.25rem' }}>
        <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `${color}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <Icon size={16} style={{ color }} />
        </div>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{children}</h3>
    </div>
);

const InfoRow = ({ label, value, bold }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontSize: '0.8125rem', fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
);

export default function DoctorReview() {
    const { resultId } = useParams();
    const navigate = useNavigate();
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const [reviewData, setReviewData] = useState({
        note_content: '',
        note_type: 'review',
        doctor_override: false,
        new_triage_level: '',
        override_reason: ''
    });

    const [showSchedule, setShowSchedule] = useState(false);
    const [scheduling, setScheduling] = useState(false);
    const [scheduleSuccess, setScheduleSuccess] = useState(false);
    const [appointmentData, setAppointmentData] = useState({
        appointment_date: '',
        appointment_time: '09:00',
        duration_minutes: 30,
        appointment_type: 'follow_up',
        notes: ''
    });

    useEffect(() => { fetchResult(); }, [resultId]);

    const fetchResult = async () => {
        try {
            const response = await triageAPI.getResult(resultId);
            setResult(response.data.result);
        } catch (err) {
            setError('Failed to load case details');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setReviewData({ ...reviewData, [name]: type === 'checkbox' ? checked : value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!reviewData.note_content.trim()) { setError('Please enter review notes'); return; }
        if (reviewData.doctor_override && !reviewData.override_reason.trim()) { setError('Override reason is required when changing the triage level'); return; }
        if (reviewData.doctor_override && !reviewData.new_triage_level) { setError('Please select a new triage level for the override'); return; }

        setSubmitting(true);
        setError('');
        try {
            await triageAPI.addReview({ triage_result_id: parseInt(resultId), ...reviewData });
            setSuccess(true);
            setTimeout(() => navigate('/doctor'), 2000);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to submit review');
        } finally {
            setSubmitting(false);
        }
    };

    const getSuggestedDate = (level) => {
        const d = new Date();
        switch (level) {
            case 'Emergency': d.setDate(d.getDate() + 0); break;
            case 'High': d.setDate(d.getDate() + 2); break;
            case 'Medium': d.setDate(d.getDate() + 7); break;
            default: d.setDate(d.getDate() + 14);
        }
        return d.toISOString().split('T')[0];
    };

    const handleScheduleAppointment = async () => {
        if (!appointmentData.appointment_date || !appointmentData.appointment_time) {
            setError('Date and time are required'); return;
        }
        setScheduling(true);
        setError('');
        try {
            await appointmentAPI.create({ patient_id: result.patient_id, triage_result_id: parseInt(resultId), ...appointmentData });
            setScheduleSuccess(true);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to schedule appointment');
        } finally {
            setScheduling(false);
        }
    };

    /* ─── Loading / Success / Not Found screens ─── */
    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <div className="spinner" style={{ margin: '0 auto 1rem' }} />
                    <p style={{ color: 'var(--text-muted)' }}>Loading case details...</p>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="slide-up" style={{ ...cardStyle, textAlign: 'center', maxWidth: 400 }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                        <CheckCircle size={28} style={{ color: '#10b981' }} />
                    </div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Review Submitted</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Redirecting to dashboard...</p>
                </div>
            </div>
        );
    }

    if (!result) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ ...cardStyle, textAlign: 'center', maxWidth: 400 }}>
                    <AlertTriangle size={44} style={{ color: '#f87171', margin: '0 auto 1rem', display: 'block' }} />
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Case Not Found</h2>
                    <Link to="/doctor" className="btn btn-primary">Back to Dashboard</Link>
                </div>
            </div>
        );
    }

    const isEmergency = result.triage_level === 'Emergency';

    // Clinical flag data
    const clinicalFlags = [
        { label: 'Hypertension', active: result.hypertension, icon: Heart, color: '#ef4444' },
        { label: 'Heart Disease', active: result.heart_disease, icon: Activity, color: '#f97316' },
        { label: 'Diabetes', active: result.diabetes, icon: Shield, color: '#f59e0b' },
        { label: `Smoking: ${result.smoking_status || 'unknown'}`, active: result.smoking_status === 'current', icon: AlertTriangle, color: '#8b5cf6' },
    ];

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
            <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem' }}>

                {/* ═══════════ HEADER ═══════════ */}
                <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                    <Link to="/doctor" style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-secondary)', textDecoration: 'none',
                        transition: 'background 0.15s',
                    }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    >
                        <ArrowLeft size={18} />
                    </Link>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ fontSize: '1.375rem', fontWeight: 700, margin: 0 }}>Case Review</h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', margin: 0 }}>Triage Result #{resultId}</p>
                    </div>
                    <TriageBadge level={result.triage_level} />
                </div>

                {/* ═══════════ EMERGENCY BANNER ═══════════ */}
                {isEmergency && (
                    <div style={{
                        padding: '0.875rem 1.25rem',
                        borderRadius: 14,
                        background: 'rgba(239, 68, 68, 0.06)',
                        border: '1px solid rgba(239, 68, 68, 0.15)',
                        marginBottom: '1.5rem',
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                    }}>
                        <AlertTriangle size={20} style={{ color: '#ef4444' }} />
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#f87171' }}>
                            Emergency Case — Immediate Review Required
                        </span>
                    </div>
                )}

                {/* ═══════════ PATIENT + RISK GRID (2-col) ═══════════ */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    {/* Patient Info */}
                    <div className="slide-up" style={cardStyle}>
                        <SectionTitle icon={User} color="#3b82f6">Patient Information</SectionTitle>
                        <InfoRow label="Name" value={result.patient_name} bold />
                        <InfoRow label="Age" value={`${result.age} years`} />
                        <InfoRow label="Gender" value={result.gender} />
                        <InfoRow label="Email" value={result.patient_email} />
                    </div>

                    {/* Risk Assessment */}
                    <div className="slide-up" style={{ ...cardStyle, animationDelay: '50ms' }}>
                        <SectionTitle icon={Activity} color="#3b82f6">Risk Assessment</SectionTitle>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Risk Score</span>
                            <span style={{ fontSize: '1.5rem', fontWeight: 800 }}>{(result.risk_score * 100).toFixed(0)}%</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Confidence</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{(result.confidence_score * 100).toFixed(0)}%</span>
                                <span style={{
                                    fontSize: '0.625rem', padding: '2px 7px', borderRadius: 20, fontWeight: 700,
                                    background: result.confidence_score >= 0.80 ? 'rgba(16,185,129,0.12)' : result.confidence_score >= 0.70 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                                    color: result.confidence_score >= 0.80 ? '#10b981' : result.confidence_score >= 0.70 ? '#f59e0b' : '#ef4444',
                                }}>
                                    {result.confidence_score >= 0.80 ? 'HIGH' : result.confidence_score >= 0.70 ? 'MED' : 'LOW'}
                                </span>
                            </div>
                        </div>
                        <InfoRow label="BMI" value={result.bmi ? result.bmi.toFixed(1) : 'N/A'} />
                        <InfoRow label="Glucose" value={result.avg_glucose_level ? `${result.avg_glucose_level.toFixed(0)} mg/dL` : 'N/A'} />

                        {result.imputed_fields && result.imputed_fields.length > 0 && (
                            <div style={{
                                marginTop: '0.75rem', padding: '0.625rem 0.75rem', borderRadius: 10,
                                background: 'rgba(234, 179, 8, 0.06)', border: '1px solid rgba(234, 179, 8, 0.15)',
                                fontSize: '0.75rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                            }}>
                                <AlertTriangle size={13} style={{ color: '#eab308', flexShrink: 0, marginTop: 1 }} />
                                <span style={{ color: '#92400e' }}>
                                    Imputed data: <strong>{result.imputed_fields.join(', ')}</strong>
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══════════ CLINICAL FLAGS (pill grid) ═══════════ */}
                <div className="slide-up" style={{ ...cardStyle, animationDelay: '100ms', marginBottom: '1rem' }}>
                    <SectionTitle icon={Stethoscope} color="#f59e0b">Clinical Flags</SectionTitle>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                        {clinicalFlags.map(flag => (
                            <div key={flag.label} style={{
                                padding: '0.75rem',
                                borderRadius: 12,
                                background: flag.active ? `${flag.color}0A` : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${flag.active ? `${flag.color}25` : 'rgba(255,255,255,0.04)'}`,
                                textAlign: 'center',
                                transition: 'all 0.2s',
                            }}>
                                <flag.icon size={18} style={{ color: flag.active ? flag.color : 'var(--text-muted)', marginBottom: 6 }} />
                                <p style={{ fontSize: '0.75rem', fontWeight: 600, margin: 0, color: flag.active ? flag.color : 'var(--text-muted)' }}>
                                    {flag.label}
                                </p>
                                <span style={{
                                    display: 'inline-block', marginTop: 4,
                                    fontSize: '0.625rem', fontWeight: 700,
                                    padding: '1px 6px', borderRadius: 20,
                                    background: flag.active ? `${flag.color}18` : 'rgba(255,255,255,0.05)',
                                    color: flag.active ? flag.color : 'var(--text-muted)',
                                }}>
                                    {flag.active ? 'PRESENT' : 'ABSENT'}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Identified risk factor flags */}
                    {result.clinical_flags && result.clinical_flags.length > 0 && (
                        <div style={{ marginTop: '1rem', padding: '0.875rem 1rem', borderRadius: 12, background: 'rgba(245, 158, 11, 0.04)', border: '1px solid rgba(245, 158, 11, 0.10)' }}>
                            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f59e0b', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Identified Risk Factors
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                                {result.clinical_flags.map((flag, i) => (
                                    <span key={i} style={{
                                        fontSize: '0.75rem', padding: '3px 10px', borderRadius: 20,
                                        background: 'rgba(245, 158, 11, 0.10)', color: '#d97706',
                                    }}>
                                        {flag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ═══════════ VOICE ANALYSIS ═══════════ */}
                {result.audio_filename && (
                    <div className="slide-up" style={{ ...cardStyle, animationDelay: '150ms', marginBottom: '1rem' }}>
                        <SectionTitle icon={Mic} color="#10b981">Voice & Speech Analysis</SectionTitle>
                        <div style={{
                            padding: '1rem 1.25rem', borderRadius: 12,
                            background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.10)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
                        }}>
                            <div>
                                <p style={{ fontWeight: 600, fontSize: '0.875rem', margin: '0 0 0.25rem' }}>Speech Pattern Analysis</p>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                                    File: {result.audio_filename} · Duration: {result.duration_seconds?.toFixed(1)}s
                                </p>
                            </div>
                            <div style={{
                                padding: '0.375rem 0.75rem', borderRadius: 10,
                                background: 'rgba(16, 185, 129, 0.12)',
                                display: 'flex', alignItems: 'center', gap: '0.375rem',
                            }}>
                                <CheckCircle size={16} style={{ color: '#10b981' }} />
                                <span style={{ fontWeight: 700, fontSize: '0.75rem', color: '#10b981' }}>Stable Pattern</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════ FACIAL ANALYSIS ═══════════ */}
                {result.video_severity && (
                    <div className="slide-up" style={{ ...cardStyle, animationDelay: '175ms', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Camera size={16} style={{ color: '#8b5cf6' }} />
                                </div>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Facial Asymmetry Analysis</h3>
                            </div>
                            <span style={{
                                fontSize: '0.6875rem', padding: '3px 10px', borderRadius: 20, fontWeight: 700,
                                background: result.video_severity === 'Severe' ? 'rgba(239,68,68,0.12)' : result.video_severity === 'Moderate' ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)',
                                color: result.video_severity === 'Severe' ? '#ef4444' : result.video_severity === 'Moderate' ? '#f59e0b' : '#10b981',
                            }}>
                                {result.video_severity?.toUpperCase()}
                            </span>
                        </div>

                        {(() => {
                            let videoData = null;
                            try {
                                videoData = typeof result.video_region_details === 'string'
                                    ? JSON.parse(result.video_region_details) : result.video_region_details;
                            } catch { videoData = null; }

                            return videoData ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                    {videoData.region_scores && Object.entries(videoData.region_scores).map(([region, score]) => {
                                        const label = videoData.region_labels?.[region] || 'Unknown';
                                        const barColor = score > 0.6 ? '#ef4444' : score > 0.3 ? '#f59e0b' : '#10b981';
                                        return (
                                            <div key={region} style={{
                                                padding: '0.75rem 1rem', borderRadius: 12,
                                                background: 'rgba(139, 92, 246, 0.03)',
                                                border: '1px solid rgba(139, 92, 246, 0.08)',
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <Eye size={14} style={{ color: '#8b5cf6' }} />
                                                        <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{region}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span style={{
                                                            fontSize: '0.625rem', padding: '2px 7px', borderRadius: 20, fontWeight: 700,
                                                            background: `${barColor}18`, color: barColor,
                                                        }}>
                                                            {label}
                                                        </span>
                                                        <span style={{ fontWeight: 700, fontSize: '0.8125rem' }}>{(score * 100).toFixed(0)}%</span>
                                                    </div>
                                                </div>
                                                <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(139,92,246,0.08)' }}>
                                                    <div style={{ width: `${score * 100}%`, height: '100%', borderRadius: 3, background: barColor, transition: 'width 0.8s ease' }} />
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {videoData.risk_score != null && (
                                        <div style={{
                                            padding: '1rem', borderRadius: 12, textAlign: 'center',
                                            background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.12)',
                                        }}>
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Overall Facial Risk Score</p>
                                            <p style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#8b5cf6' }}>
                                                {(videoData.risk_score * 100).toFixed(0)}%
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                                    Facial asymmetry analysis complete — severity: {result.video_severity}
                                </p>
                            );
                        })()}

                        <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.75rem' }}>
                            📸 Eye, eyebrow, and mouth regions analyzed for asymmetry using EfficientNet-B3.
                        </p>
                    </div>
                )}

                {/* ═══════════ REVIEW FORM ═══════════ */}
                <div className="slide-up" style={{ ...cardStyle, animationDelay: '200ms', marginBottom: '1rem' }}>
                    <SectionTitle icon={FileText} color="#3b82f6">Clinical Review</SectionTitle>

                    <form onSubmit={handleSubmit}>
                        {error && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.75rem 1rem', borderRadius: 10, marginBottom: '1rem',
                                background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
                            }}>
                                <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.8125rem', color: '#f87171' }}>{error}</span>
                            </div>
                        )}

                        <div className="input-group">
                            <label className="input-label">Review Type</label>
                            <select name="note_type" className="select" value={reviewData.note_type} onChange={handleChange}>
                                <option value="review">Standard Review</option>
                                <option value="follow-up">Follow-up Required</option>
                                <option value="escalation">Escalation</option>
                                <option value="discharge">Discharge</option>
                            </select>
                        </div>

                        <div className="input-group">
                            <label className="input-label">Clinical Notes *</label>
                            <textarea
                                name="note_content" className="input" rows="4"
                                placeholder="Enter your clinical assessment and recommendations..."
                                value={reviewData.note_content} onChange={handleChange}
                                style={{ resize: 'vertical' }}
                            />
                        </div>

                        {/* Override toggle */}
                        <div style={{
                            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                            padding: '0.875rem 1rem', borderRadius: 12, marginBottom: '1rem',
                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                            cursor: 'pointer',
                        }} onClick={() => setReviewData({ ...reviewData, doctor_override: !reviewData.doctor_override })}>
                            <input type="checkbox" id="doctor_override" name="doctor_override" className="checkbox"
                                checked={reviewData.doctor_override} onChange={handleChange}
                                onClick={(e) => e.stopPropagation()}
                            />
                            <div>
                                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Override Triage Decision</span>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                                    Check if clinical judgment differs from system assessment
                                </p>
                            </div>
                        </div>

                        {reviewData.doctor_override && (
                            <div style={{
                                padding: '1.25rem', borderRadius: 14, marginBottom: '1rem',
                                background: 'rgba(99, 102, 241, 0.04)', border: '1px solid rgba(99, 102, 241, 0.10)',
                            }}>
                                <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.875rem' }}>
                                    Override Details
                                </p>
                                <div className="input-group">
                                    <label className="input-label">New Triage Level *</label>
                                    <select name="new_triage_level" className="select" value={reviewData.new_triage_level} onChange={handleChange} required={reviewData.doctor_override}>
                                        <option value="">Select Level</option>
                                        <option value="Low">Low Risk</option>
                                        <option value="Medium">Medium Risk</option>
                                        <option value="High">High Risk</option>
                                        <option value="Emergency">Emergency</option>
                                    </select>
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label">Override Reason *</label>
                                    <textarea name="override_reason" className="input" rows="2"
                                        placeholder="Justification for override..."
                                        value={reviewData.override_reason} onChange={handleChange}
                                        required={reviewData.doctor_override}
                                    />
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button type="submit" className="btn btn-primary" disabled={submitting} style={{ gap: '0.375rem' }}>
                                {submitting ? (
                                    <><div className="spinner" style={{ width: '1.125rem', height: '1.125rem' }} /> Submitting...</>
                                ) : (
                                    <><Send size={16} /> Submit Review</>
                                )}
                            </button>
                            <Link to="/doctor" className="btn btn-secondary">Cancel</Link>
                        </div>
                    </form>
                </div>

                {/* ═══════════ APPOINTMENT SCHEDULER ═══════════ */}
                <div className="slide-up" style={{ ...cardStyle, animationDelay: '250ms' }}>
                    <div
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                        onClick={() => {
                            if (!showSchedule) {
                                setAppointmentData(prev => ({
                                    ...prev,
                                    appointment_date: prev.appointment_date || getSuggestedDate(result.triage_level),
                                    appointment_type: result.triage_level === 'Emergency' ? 'urgent' : 'follow_up'
                                }));
                            }
                            setShowSchedule(!showSchedule);
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Calendar size={16} style={{ color: '#3b82f6' }} />
                            </div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Schedule Follow-up</h3>
                        </div>
                        <ChevronDown size={18} style={{
                            color: 'var(--text-muted)',
                            transition: 'transform 0.2s',
                            transform: showSchedule ? 'rotate(180deg)' : 'rotate(0deg)',
                        }} />
                    </div>

                    {scheduleSuccess && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.75rem 1rem', borderRadius: 10, marginTop: '1rem',
                            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                        }}>
                            <CheckCircle size={16} style={{ color: '#10b981' }} />
                            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#10b981' }}>Appointment scheduled!</span>
                        </div>
                    )}

                    {showSchedule && !scheduleSuccess && (
                        <div style={{ marginTop: '1.25rem' }}>
                            <div style={{
                                padding: '0.75rem 1rem', borderRadius: 10, marginBottom: '1rem',
                                background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.10)',
                                fontSize: '0.8125rem',
                            }}>
                                💡 Based on <strong>{result.triage_level}</strong> triage level, suggested follow-up:
                                <strong>
                                    {result.triage_level === 'Emergency' ? ' Today (Urgent)'
                                        : result.triage_level === 'High' ? ' Within 2–3 days'
                                            : result.triage_level === 'Medium' ? ' Within 1 week' : ' Within 2 weeks'}
                                </strong>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                                <div className="input-group">
                                    <label className="input-label">Date *</label>
                                    <input type="date" className="input"
                                        value={appointmentData.appointment_date}
                                        min={new Date().toISOString().split('T')[0]}
                                        onChange={(e) => setAppointmentData({ ...appointmentData, appointment_date: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Time *</label>
                                    <input type="time" className="input"
                                        value={appointmentData.appointment_time}
                                        onChange={(e) => setAppointmentData({ ...appointmentData, appointment_time: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Type</label>
                                    <select className="select" value={appointmentData.appointment_type}
                                        onChange={(e) => setAppointmentData({ ...appointmentData, appointment_type: e.target.value })}>
                                        <option value="urgent">Urgent</option>
                                        <option value="follow_up">Follow-up</option>
                                        <option value="consultation">Consultation</option>
                                        <option value="routine">Routine</option>
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Duration</label>
                                    <select className="select" value={appointmentData.duration_minutes}
                                        onChange={(e) => setAppointmentData({ ...appointmentData, duration_minutes: parseInt(e.target.value) })}>
                                        <option value={15}>15 min</option>
                                        <option value={30}>30 min</option>
                                        <option value={45}>45 min</option>
                                        <option value={60}>60 min</option>
                                    </select>
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Notes</label>
                                <textarea className="input" rows="2"
                                    placeholder="Any specific instructions..."
                                    value={appointmentData.notes}
                                    onChange={(e) => setAppointmentData({ ...appointmentData, notes: e.target.value })}
                                    style={{ resize: 'vertical' }}
                                />
                            </div>

                            <button type="button" className="btn btn-primary" onClick={handleScheduleAppointment}
                                disabled={scheduling} style={{ gap: '0.375rem' }}>
                                {scheduling ? (
                                    <><div className="spinner" style={{ width: '1.125rem', height: '1.125rem' }} /> Scheduling...</>
                                ) : (
                                    <><Calendar size={16} /> Schedule Appointment</>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
