/**
 * Triage Result Page
 * Displays risk score, triage level, recommendations, and clinical flags
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { triageAPI } from '../services/api';
import {
    Activity,
    ArrowLeft,
    AlertTriangle,
    CheckCircle,
    Clock,
    User,
    FileText,
    Mic,
    Phone,
    ChevronDown,
    ChevronUp,
    Camera,
    Eye
} from 'lucide-react';

function TriageBadge({ level }) {
    const config = {
        Low: {
            className: 'triage-badge-low',
            label: 'LOW RISK',
            icon: CheckCircle,
            color: '#10b981'
        },
        Medium: {
            className: 'triage-badge-medium',
            label: 'MEDIUM RISK',
            icon: Clock,
            color: '#f59e0b'
        },
        High: {
            className: 'triage-badge-high',
            label: 'HIGH RISK',
            icon: AlertTriangle,
            color: '#f97316'
        },
        Emergency: {
            className: 'triage-badge-emergency',
            label: 'EMERGENCY',
            icon: AlertTriangle,
            color: '#ef4444'
        },
    };
    const { className, label, icon: Icon, color } = config[level] || config.Low;

    return (
        <div className="flex items-center gap-2">
            <Icon size={20} style={{ color }} />
            <span className={`triage-badge ${className}`}>{label}</span>
        </div>
    );
}

function RiskGauge({ score }) {
    // Score is 0-1, need to convert to degrees (0 = -90deg, 1 = 90deg)
    const rotation = -90 + (score * 180);

    return (
        <div className="relative w-48 h-24 mx-auto overflow-hidden">
            {/* Background arc */}
            <div
                className="absolute w-48 h-48 rounded-full"
                style={{
                    background: `conic-gradient(
            from 180deg,
            #10b981 0deg 60deg,
            #f59e0b 60deg 120deg,
            #ef4444 120deg 180deg,
            transparent 180deg 360deg
          )`,
                    mask: 'radial-gradient(circle at center, transparent 55%, black 55%)',
                    WebkitMask: 'radial-gradient(circle at center, transparent 55%, black 55%)',
                }}
            />
            {/* Needle */}
            <div
                className="absolute bottom-0 left-1/2 w-1 h-20 origin-bottom rounded-full"
                style={{
                    background: 'linear-gradient(to top, #475569, #94a3b8)',
                    transform: `translateX(-50%) rotate(${rotation}deg)`,
                    transition: 'transform 1s ease-out'
                }}
            />
            {/* Center dot */}
            <div
                className="absolute bottom-0 left-1/2 w-4 h-4 rounded-full"
                style={{
                    background: '#475569',
                    transform: 'translateX(-50%) translateY(50%)'
                }}
            />
        </div>
    );
}

export default function TriageResult() {
    const { resultId } = useParams();
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showFullRecommendation, setShowFullRecommendation] = useState(false);

    useEffect(() => {
        fetchResult();
    }, [resultId]);

    const fetchResult = async () => {
        try {
            const response = await triageAPI.getResult(resultId);
            setResult(response.data.result);
        } catch (err) {
            setError('Failed to load triage result');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="spinner mx-auto mb-4" />
                    <p className="text-secondary">Loading triage result...</p>
                </div>
            </div>
        );
    }

    if (error || !result) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="glass-card-static text-center max-w-md">
                    <AlertTriangle size={48} className="mx-auto mb-4 text-red-400" />
                    <h2 className="text-xl font-semibold mb-2">Error</h2>
                    <p className="text-secondary mb-4">{error || 'Result not found'}</p>
                    <Link to="/patient" className="btn btn-primary">
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    const isEmergency = result.triage_level === 'Emergency';

    return (
        <div className="min-h-screen p-6">
            <div className="container max-w-3xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8 fade-in">
                    <Link to="/patient" className="btn btn-secondary btn-sm">
                        <ArrowLeft size={18} />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold mb-0">Triage Assessment Result</h1>
                        <p className="text-secondary text-sm">{formatDate(result.assessment_date)}</p>
                    </div>
                </div>

                {/* Emergency / Safety Net Alert */}
                {isEmergency && (
                    <div className="disclaimer disclaimer-emergency mb-6 slide-up">
                        <div className="flex items-start gap-3">
                            <div className="rounded-full p-2 animate-pulse" style={{ background: 'rgba(239, 68, 68, 0.15)' }}>
                                <span className="text-2xl">🚑</span>
                            </div>
                            <div className="flex-1">
                                <p className="font-bold text-lg mb-1" style={{ color: '#f87171' }}>
                                    AMBULANCE DISPATCH REQUESTED
                                </p>
                                <p className="text-sm mb-3" style={{ color: '#fca5a5' }}>
                                    {result.safety_net_triggered
                                        ? "Critical signs detected. "
                                        : "High stroke risk confirmed. "}
                                    A priority alert has been sent to your assigned doctor/hospital.
                                    <strong> Do not move the patient.</strong>
                                </p>
                                <div className="rounded-lg p-3" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.20)' }}>
                                    <p className="text-xs font-bold uppercase mb-1" style={{ color: '#f87171' }}>Dispatching to Registered Address:</p>
                                    <p className="font-mono text-lg break-words" style={{ color: '#f1f5f9' }}>
                                        {result.patient_address || "Address not provided - Please contact hospital manually"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Result Card */}
                <div className="glass-card-static mb-6 slide-up">
                    <div className="text-center mb-8">
                        <TriageBadge level={result.triage_level} />
                        {result.assessment_type === 'clinical_only' && (
                            <div className="mt-3 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider" style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.20)', color: '#2563eb' }}>
                                <Activity size={12} />
                                Clinical Only
                            </div>
                        )}
                        <div className="mt-6">
                            <RiskGauge score={result.risk_score} />
                            <p className="text-4xl font-bold mt-4">
                                {(result.risk_score * 100).toFixed(0)}%
                            </p>
                            <p className="text-secondary">Early Warning Risk Score</p>
                        </div>
                    </div>

                    {/* Confidence & Stats */}
                    <div className="flex justify-center gap-8 py-4 border-t border-b" style={{ borderColor: 'rgba(99,102,241,0.12)' }}>
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-2">
                                <p className="text-2xl font-semibold">{(result.confidence_score * 100).toFixed(0)}%</p>
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
                            <p className="text-sm text-secondary">Confidence Level</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-semibold">{result.clinical_flags?.length || 0}</p>
                            <p className="text-sm text-secondary">Risk Factors</p>
                        </div>
                    </div>

                    {/* Low confidence notice */}
                    {result.confidence_score < 0.70 && (
                        <div className="mx-4 mt-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                            <p className="flex items-center gap-2" style={{ color: '#dc2626' }}>
                                <AlertTriangle size={14} />
                                <span>
                                    <strong>Low confidence assessment</strong> — This case has been flagged for
                                    priority doctor review. Including a voice recording improves accuracy.
                                </span>
                            </p>
                        </div>
                    )}

                    {/* Imputed Fields Warning */}
                    {result.imputed_fields && result.imputed_fields.length > 0 && (
                        <div className="mx-8 mb-6 mt-6 p-3 rounded-lg text-sm text-center" style={{ background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.20)', color: '#92400e' }}>
                            <p className="flex items-center justify-center gap-2">
                                <AlertTriangle size={14} className="text-yellow-500" />
                                <span>
                                    Note: Values for <strong>{result.imputed_fields.join(', ')}</strong> were missing and estimated.
                                </span>
                            </p>
                        </div>
                    )}
                </div>

                {/* Voice Analysis Section */}
                {result.audio_filename && (
                    <div className="glass-card-static mb-6 slide-up" style={{ animationDelay: '50ms' }}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold mb-0 flex items-center gap-2">
                                <Mic size={18} style={{ color: '#10b981' }} />
                                Voice & Speech Analysis
                            </h3>
                            <span className="text-xs px-2 py-1 rounded-full bg-triage-low-bg text-triage-low font-bold">
                                PROCESSED
                            </span>
                        </div>
                        <div className="flex items-center gap-4 p-4 rounded-lg" style={{ background: 'rgba(99,102,241,0.05)' }}>
                            <div className="flex-1">
                                <p className="text-sm font-medium">Speech Pattern Analysis</p>
                                <p className="text-xs text-secondary">
                                    Duration: {result.duration_seconds?.toFixed(1)}s •
                                    Format: {result.audio_filename.split('.').pop().toUpperCase()}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-secondary mb-1">Impact on Score</p>
                                <div className="flex items-center gap-1 justify-end">
                                    <div className="w-2 h-2 rounded-full" style={{ background: '#10b981' }} />
                                    <span className="text-sm font-bold">Stable</span>
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-muted mt-3 italic">
                            💡 Speech analysis detected no major prosodic inconsistencies often associated with dysarthria in early stroke.
                        </p>
                    </div>
                )}

                {/* Facial Analysis Section */}
                {result.video_severity && (
                    <div className="glass-card-static mb-6 slide-up" style={{ animationDelay: '75ms' }}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold mb-0 flex items-center gap-2">
                                <Camera size={18} style={{ color: '#8b5cf6' }} />
                                Facial Analysis
                            </h3>
                            <span className={`text-xs px-2 py-1 rounded-full font-bold ${result.video_severity === 'Severe' ? 'bg-red-500/12 text-red-400'
                                    : result.video_severity === 'Moderate' ? 'bg-yellow-500/12 text-yellow-400'
                                        : 'bg-green-500/12 text-green-400'
                                }`}>
                                {result.video_severity?.toUpperCase()}
                            </span>
                        </div>

                        {(() => {
                            let videoData = null;
                            try {
                                videoData = typeof result.video_region_details === 'string'
                                    ? JSON.parse(result.video_region_details)
                                    : result.video_region_details;
                            } catch { videoData = null; }

                            return videoData ? (
                                <div className="space-y-4">
                                    {/* Per-region results */}
                                    {videoData.region_scores && Object.entries(videoData.region_scores).map(([region, score]) => {
                                        const label = videoData.region_labels?.[region] || 'Unknown';
                                        const barColor = score > 0.6 ? '#ef4444' : score > 0.3 ? '#f59e0b' : '#10b981';
                                        return (
                                            <div key={region} className="p-3 rounded-lg" style={{ background: 'rgba(99,102,241,0.05)' }}>
                                                <div className="flex justify-between items-center mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <Eye size={14} style={{ color: '#8b5cf6' }} />
                                                        <span className="text-sm font-medium">{region}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{
                                                            background: `${barColor}18`,
                                                            color: barColor
                                                        }}>
                                                            {label}
                                                        </span>
                                                        <span className="text-sm font-semibold">{(score * 100).toFixed(0)}%</span>
                                                    </div>
                                                </div>
                                                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.10)' }}>
                                                    <div
                                                        className="h-full rounded-full transition-all duration-1000"
                                                        style={{ width: `${score * 100}%`, background: barColor }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Overall video risk */}
                                    {videoData.risk_score != null && (
                                        <div className="p-4 rounded-lg text-center" style={{ background: 'rgba(139, 92, 246, 0.06)', border: '1px solid rgba(139, 92, 246, 0.15)' }}>
                                            <p className="text-sm text-secondary mb-1">Overall Facial Risk Score</p>
                                            <p className="text-2xl font-bold" style={{ color: '#8b5cf6' }}>
                                                {(videoData.risk_score * 100).toFixed(0)}%
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-secondary">Facial asymmetry analysis complete — severity: {result.video_severity}</p>
                            );
                        })()}

                        <p className="text-xs text-muted mt-3 italic">
                            📸 Facial analysis examined eye, eyebrow, and mouth regions for asymmetry patterns associated with stroke.
                        </p>
                    </div>
                )}

                {/* Clinical Flags */}
                {result.clinical_flags && result.clinical_flags.length > 0 && (
                    <div className="glass-card-static mb-6 slide-up" style={{ animationDelay: '100ms' }}>
                        <h3 className="font-semibold mb-4 flex items-center gap-2">
                            <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
                            Identified Risk Factors
                        </h3>
                        <ul className="space-y-2">
                            {result.clinical_flags.map((flag, index) => (
                                <li key={index} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'rgba(99,102,241,0.05)' }}>
                                    <span style={{ color: '#f59e0b' }}>•</span>
                                    <span className="text-secondary">{flag}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Recommendations */}
                <div className="glass-card-static mb-6 slide-up" style={{ animationDelay: '200ms' }}>
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <FileText size={18} style={{ color: '#3b82f6' }} />
                        Clinical Recommendations
                    </h3>
                    <div
                        className="p-4 rounded-lg text-sm whitespace-pre-wrap"
                        style={{ background: 'rgba(99,102,241,0.05)' }}
                    >
                        {showFullRecommendation
                            ? result.recommendation
                            : result.recommendation.slice(0, 500) + (result.recommendation.length > 500 ? '...' : '')
                        }
                    </div>
                    {result.recommendation.length > 500 && (
                        <button
                            onClick={() => setShowFullRecommendation(!showFullRecommendation)}
                            className="flex items-center gap-1 mt-3 text-sm"
                            style={{ color: '#3b82f6' }}
                        >
                            {showFullRecommendation ? (
                                <>Show less <ChevronUp size={16} /></>
                            ) : (
                                <>Show full recommendation <ChevronDown size={16} /></>
                            )}
                        </button>
                    )}
                </div>

                {/* Feature Importance */}
                {result.feature_importance && Object.keys(result.feature_importance).length > 0 && (
                    <div className="glass-card-static mb-6 slide-up" style={{ animationDelay: '300ms' }}>
                        <h3 className="font-semibold mb-4">Contributing Factors</h3>
                        <div className="space-y-3">
                            {Object.entries(result.feature_importance)
                                .sort((a, b) => b[1] - a[1])
                                .map(([feature, importance]) => (
                                    <div key={feature}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-secondary">{feature}</span>
                                            <span className="font-medium">{(importance * 100).toFixed(0)}%</span>
                                        </div>
                                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.10)' }}>
                                            <div
                                                className="h-full rounded-full transition-all duration-1000"
                                                style={{
                                                    width: `${importance * 100}%`,
                                                    background: importance > 0.1 ? '#ef4444' : importance > 0.05 ? '#f59e0b' : '#10b981'
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-4 mb-8">
                    <Link to="/patient/assessment" className="btn btn-primary flex-1">
                        <Activity size={18} />
                        New Assessment
                    </Link>
                    <Link to="/patient" className="btn btn-secondary flex-1">
                        Back to Dashboard
                    </Link>
                </div>

                {/* Disclaimer */}
                <div className="disclaimer text-center">
                    <p className="text-sm">
                        ⚕️ <strong>Clinical Decision Support Disclaimer:</strong> This is an EARLY WARNING
                        system designed to assist healthcare professionals. It is NOT a diagnostic tool.
                        All assessments must be reviewed by qualified medical professionals. Final clinical
                        decisions rest with the treating physician.
                    </p>
                </div>
            </div>
        </div>
    );
}
