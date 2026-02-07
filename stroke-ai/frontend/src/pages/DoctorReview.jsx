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
} from 'lucide-react';

function TriageBadge({ level }) {
    const config = {
        Low: { className: 'triage-badge-low', label: 'LOW RISK', color: '#10b981' },
        Medium: { className: 'triage-badge-medium', label: 'MEDIUM RISK', color: '#f59e0b' },
        High: { className: 'triage-badge-high', label: 'HIGH RISK', color: '#f97316' },
        Emergency: { className: 'triage-badge-emergency', label: 'EMERGENCY', color: '#ef4444' },
    };
    const { className, label } = config[level] || config.Low;
    return <span className={`triage-badge ${className}`}>{label}</span>;
}

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

    // Appointment scheduling state
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

    useEffect(() => {
        fetchResult();
    }, [resultId]);

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
        setReviewData({
            ...reviewData,
            [name]: type === 'checkbox' ? checked : value,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!reviewData.note_content.trim()) {
            setError('Please enter review notes');
            return;
        }
        if (reviewData.doctor_override && !reviewData.override_reason.trim()) {
            setError('Override reason is required when changing the triage level');
            return;
        }
        if (reviewData.doctor_override && !reviewData.new_triage_level) {
            setError('Please select a new triage level for the override');
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            await triageAPI.addReview({
                triage_result_id: parseInt(resultId),
                ...reviewData,
            });
            setSuccess(true);
            setTimeout(() => navigate('/doctor'), 2000);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to submit review');
        } finally {
            setSubmitting(false);
        }
    };

    // Suggest appointment date based on triage level
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
            setError('Date and time are required for scheduling');
            return;
        }
        setScheduling(true);
        setError('');
        try {
            await appointmentAPI.create({
                patient_id: result.patient_id,
                triage_result_id: parseInt(resultId),
                ...appointmentData
            });
            setScheduleSuccess(true);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to schedule appointment');
        } finally {
            setScheduling(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="spinner mx-auto mb-4" />
                    <p className="text-secondary">Loading case details...</p>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="glass-card-static text-center max-w-md slide-up">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(16, 185, 129, 0.12)' }}>
                        <CheckCircle size={32} style={{ color: '#10b981' }} />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">Review Submitted</h2>
                    <p className="text-secondary">Redirecting to dashboard...</p>
                </div>
            </div>
        );
    }

    if (!result) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="glass-card-static text-center max-w-md">
                    <AlertTriangle size={48} className="mx-auto mb-4 text-red-400" />
                    <h2 className="text-xl font-semibold mb-2">Case Not Found</h2>
                    <Link to="/doctor" className="btn btn-primary mt-4">
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    const isEmergency = result.triage_level === 'Emergency';

    return (
        <div className="min-h-screen p-6">
            <div className="container max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6 fade-in">
                    <Link to="/doctor" className="btn btn-secondary btn-sm">
                        <ArrowLeft size={18} />
                    </Link>
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold mb-0">Case Review</h1>
                        <p className="text-secondary text-sm">Triage Result #{resultId}</p>
                    </div>
                    <TriageBadge level={result.triage_level} />
                </div>

                {/* Emergency Alert */}
                {isEmergency && (
                    <div className="disclaimer disclaimer-emergency mb-6">
                        <div className="flex items-center gap-3">
                            <AlertTriangle size={20} />
                            <span className="font-medium">Emergency Case - Immediate Review Required</span>
                        </div>
                    </div>
                )}

                <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    {/* Patient Info */}
                    <div className="glass-card-static slide-up">
                        <h3 className="font-semibold mb-4 flex items-center gap-2">
                            <User size={18} style={{ color: '#3b82f6' }} />
                            Patient Information
                        </h3>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-secondary">Name</span>
                                <span className="font-medium">{result.patient_name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-secondary">Age</span>
                                <span>{result.age} years</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-secondary">Gender</span>
                                <span>{result.gender}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-secondary">Email</span>
                                <span className="text-sm">{result.patient_email}</span>
                            </div>
                        </div>
                    </div>

                    {/* Risk Assessment */}
                    <div className="glass-card-static slide-up" style={{ animationDelay: '50ms' }}>
                        <h3 className="font-semibold mb-4 flex items-center gap-2">
                            <Activity size={18} style={{ color: '#3b82f6' }} />
                            Risk Assessment
                        </h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-secondary">Risk Score</span>
                                <span className="text-2xl font-bold">{(result.risk_score * 100).toFixed(0)}%</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-secondary">Confidence</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{(result.confidence_score * 100).toFixed(0)}%</span>
                                    <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{
                                        background: result.confidence_score >= 0.80 ? 'rgba(16, 185, 129, 0.12)'
                                            : result.confidence_score >= 0.70 ? 'rgba(245, 158, 11, 0.12)'
                                                : 'rgba(239, 68, 68, 0.12)',
                                        color: result.confidence_score >= 0.80 ? '#059669'
                                            : result.confidence_score >= 0.70 ? '#d97706'
                                                : '#dc2626'
                                    }}>
                                        {result.confidence_score >= 0.80 ? 'HIGH'
                                            : result.confidence_score >= 0.70 ? 'MEDIUM'
                                                : 'LOW'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-secondary">BMI</span>
                                <span>{result.bmi ? result.bmi.toFixed(1) : 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>{result.avg_glucose_level ? `${result.avg_glucose_level.toFixed(0)} mg/dL` : 'N/A'}</span>
                            </div>

                            {/* Imputed Fields Warning */}
                            {result.imputed_fields && result.imputed_fields.length > 0 && (
                                <div className="mt-3 p-2 rounded" style={{ background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.20)', color: '#92400e', fontSize: '0.75rem' }}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <AlertTriangle size={12} className="text-yellow-500" />
                                        <span className="font-semibold">Imputed Data</span>
                                    </div>
                                    <p>Values for <strong>{result.imputed_fields.join(', ')}</strong> were missing.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Clinical Flags */}
                <div className="glass-card-static slide-up" style={{ animationDelay: '100ms' }}>
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
                        Clinical Flags
                    </h3>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className={result.hypertension ? 'text-red-400' : 'text-muted'}>
                                {result.hypertension ? '●' : '○'}
                            </span>
                            <span className={result.hypertension ? '' : 'text-muted'}>Hypertension</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={result.heart_disease ? 'text-red-400' : 'text-muted'}>
                                {result.heart_disease ? '●' : '○'}
                            </span>
                            <span className={result.heart_disease ? '' : 'text-muted'}>Heart Disease</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={result.diabetes ? 'text-red-400' : 'text-muted'}>
                                {result.diabetes ? '●' : '○'}
                            </span>
                            <span className={result.diabetes ? '' : 'text-muted'}>Diabetes</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={result.smoking_status === 'current' ? 'text-red-400' : 'text-muted'}>
                                {result.smoking_status === 'current' ? '●' : '○'}
                            </span>
                            <span className={result.smoking_status === 'current' ? '' : 'text-muted'}>
                                Smoking: {result.smoking_status || 'unknown'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Additional Flags */}
                <div className="glass-card-static slide-up" style={{ animationDelay: '150ms' }}>
                    <h3 className="font-semibold mb-4">Identified Risk Factors</h3>
                    {result.clinical_flags && result.clinical_flags.length > 0 ? (
                        <ul className="space-y-2 text-sm">
                            {result.clinical_flags.map((flag, i) => (
                                <li key={i} className="flex items-start gap-2">
                                    <span style={{ color: '#f59e0b' }}>•</span>
                                    <span className="text-secondary">{flag}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-muted text-sm">No specific flags identified</p>
                    )}
                </div>

                {/* Voice Analysis Section */}
                {result.audio_filename && (
                    <div className="glass-card-static slide-up col-span-2" style={{ animationDelay: '175ms' }}>
                        <h3 className="font-semibold mb-4 flex items-center gap-2">
                            <Mic size={18} style={{ color: '#10b981' }} />
                            Voice & Speech Analysis
                        </h3>
                        <div className="flex items-center gap-6 p-4 rounded-lg" style={{ background: 'rgba(99,102,241,0.05)' }}>
                            <div className="flex-1">
                                <p className="font-medium">Speech Pattern Analysis</p>
                                <p className="text-sm text-secondary">
                                    File: {result.audio_filename} •
                                    Duration: {result.duration_seconds?.toFixed(1)}s
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-triage-low-bg text-triage-low flex items-center gap-2">
                                <CheckCircle size={18} />
                                <span className="font-bold text-sm">Stable Pattern Detected</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Review Form */}
            <div className="glass-card-static mt-6 slide-up" style={{ animationDelay: '200ms' }}>
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <FileText size={18} style={{ color: '#3b82f6' }} />
                    Clinical Review
                </h3>

                <form onSubmit={handleSubmit}>
                    {error && (
                        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
                            <AlertTriangle size={18} />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    <div className="input-group">
                        <label className="input-label">Review Type</label>
                        <select
                            name="note_type"
                            className="select"
                            value={reviewData.note_type}
                            onChange={handleChange}
                        >
                            <option value="review">Standard Review</option>
                            <option value="follow-up">Follow-up Required</option>
                            <option value="escalation">Escalation</option>
                            <option value="discharge">Discharge</option>
                        </select>
                    </div>

                    <div className="input-group">
                        <label className="input-label">Clinical Notes *</label>
                        <textarea
                            name="note_content"
                            className="input"
                            rows="4"
                            placeholder="Enter your clinical assessment and recommendations..."
                            value={reviewData.note_content}
                            onChange={handleChange}
                            style={{ resize: 'vertical' }}
                        />
                    </div>

                    <div className="checkbox-group mb-6">
                        <input
                            type="checkbox"
                            id="doctor_override"
                            name="doctor_override"
                            className="checkbox"
                            checked={reviewData.doctor_override}
                            onChange={handleChange}
                        />
                        <label htmlFor="doctor_override">
                            <span className="font-medium">Override Triage Decision</span>
                            <p className="text-sm text-muted">Check if clinical judgment differs from system assessment</p>
                        </label>
                    </div>

                    {reviewData.doctor_override && (
                        <div className="p-4 mb-6 rounded-lg animate-fade-in" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)' }}>
                            <h4 className="text-sm font-semibold mb-3 text-secondary">Override Details</h4>
                            <div className="input-group">
                                <label className="input-label">New Triage Level *</label>
                                <select
                                    name="new_triage_level"
                                    className="select"
                                    value={reviewData.new_triage_level}
                                    onChange={handleChange}
                                    required={reviewData.doctor_override}
                                >
                                    <option value="">Select Level</option>
                                    <option value="Low">Low Risk</option>
                                    <option value="Medium">Medium Risk</option>
                                    <option value="High">High Risk</option>
                                    <option value="Emergency">Emergency</option>
                                </select>
                            </div>
                            <div className="input-group mb-0">
                                <label className="input-label">Override Reason *</label>
                                <textarea
                                    name="override_reason"
                                    className="input"
                                    rows="2"
                                    placeholder="Justification for override..."
                                    value={reviewData.override_reason}
                                    onChange={handleChange}
                                    required={reviewData.doctor_override}
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex gap-4">
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? (
                                <>
                                    <div className="spinner" style={{ width: '1.25rem', height: '1.25rem' }} />
                                    Submitting...
                                </>
                            ) : (
                                <>
                                    <Send size={18} />
                                    Submit Review
                                </>
                            )}
                        </button>
                        <Link to="/doctor" className="btn btn-secondary">
                            Cancel
                        </Link>
                    </div>
                </form>
            </div>
            {/* Schedule Appointment Section */}
            <div className="glass-card-static mt-6 slide-up" style={{ animationDelay: '250ms' }}>
                <div
                    className="flex justify-between items-center cursor-pointer"
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
                    <h3 className="font-semibold flex items-center gap-2 mb-0">
                        <Calendar size={18} style={{ color: '#3b82f6' }} />
                        Schedule Follow-up Appointment
                    </h3>
                    <span className="text-secondary text-sm">{showSchedule ? '▲ Collapse' : '▼ Expand'}</span>
                </div>

                {scheduleSuccess && (
                    <div className="flex items-center gap-2 p-3 mt-4 rounded-lg" style={{ background: 'rgba(16, 185, 129, 0.10)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#059669' }}>
                        <CheckCircle size={18} />
                        <span className="text-sm font-medium">Appointment scheduled successfully!</span>
                    </div>
                )}

                {showSchedule && !scheduleSuccess && (
                    <div className="mt-4 space-y-4">
                        {/* Triage-based suggestion */}
                        <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
                            💡 Based on <strong>{result.triage_level}</strong> triage level, suggested follow-up:
                            <strong>
                                {result.triage_level === 'Emergency' ? ' Today (Urgent)'
                                    : result.triage_level === 'High' ? ' Within 2–3 days'
                                        : result.triage_level === 'Medium' ? ' Within 1 week'
                                            : ' Within 2 weeks'}
                            </strong>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="input-group">
                                <label className="input-label">Date *</label>
                                <input
                                    type="date"
                                    className="input"
                                    value={appointmentData.appointment_date}
                                    min={new Date().toISOString().split('T')[0]}
                                    onChange={(e) => setAppointmentData({ ...appointmentData, appointment_date: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Time *</label>
                                <input
                                    type="time"
                                    className="input"
                                    value={appointmentData.appointment_time}
                                    onChange={(e) => setAppointmentData({ ...appointmentData, appointment_time: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="input-group">
                                <label className="input-label">Type</label>
                                <select
                                    className="select"
                                    value={appointmentData.appointment_type}
                                    onChange={(e) => setAppointmentData({ ...appointmentData, appointment_type: e.target.value })}
                                >
                                    <option value="urgent">Urgent</option>
                                    <option value="follow_up">Follow-up</option>
                                    <option value="consultation">Consultation</option>
                                    <option value="routine">Routine</option>
                                </select>
                            </div>
                            <div className="input-group">
                                <label className="input-label">Duration (min)</label>
                                <select
                                    className="select"
                                    value={appointmentData.duration_minutes}
                                    onChange={(e) => setAppointmentData({ ...appointmentData, duration_minutes: parseInt(e.target.value) })}
                                >
                                    <option value={15}>15 min</option>
                                    <option value={30}>30 min</option>
                                    <option value={45}>45 min</option>
                                    <option value={60}>60 min</option>
                                </select>
                            </div>
                        </div>

                        <div className="input-group">
                            <label className="input-label">Appointment Notes</label>
                            <textarea
                                className="input"
                                rows="2"
                                placeholder="Any specific instructions for this appointment..."
                                value={appointmentData.notes}
                                onChange={(e) => setAppointmentData({ ...appointmentData, notes: e.target.value })}
                                style={{ resize: 'vertical' }}
                            />
                        </div>

                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleScheduleAppointment}
                            disabled={scheduling}
                        >
                            {scheduling ? (
                                <>
                                    <div className="spinner" style={{ width: '1.25rem', height: '1.25rem' }} />
                                    Scheduling...
                                </>
                            ) : (
                                <>
                                    <Calendar size={18} />
                                    Schedule Appointment
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>

    );
}
