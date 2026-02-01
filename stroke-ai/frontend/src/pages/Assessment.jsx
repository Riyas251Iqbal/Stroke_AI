import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { triageAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
    Activity,
    ArrowLeft,
    Upload,
    Mic,
    AlertCircle,
    CheckCircle,
    User,
    Heart,
    Thermometer,
    Cigarette,
    ChevronRight,
    Clock,
    AlertTriangle,
} from 'lucide-react';
import { encodeWAV } from '../utils/waveEncoder';

export default function Assessment() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialStep = parseInt(searchParams.get('step')) || 1;
    const { user } = useAuth();

    // Hooks & State
    const [step, setStep] = useState(initialStep);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [audioFile, setAudioFile] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [timerInterval, setTimerInterval] = useState(null);
    const [audioContext, setAudioContext] = useState(null);
    const [audioStream, setAudioStream] = useState(null);
    const [processor, setProcessor] = useState(null);
    const [audioChunks, setAudioChunks] = useState([]);

    const [formData, setFormData] = useState({
        // age removed - now auto-calculated from DOB on backend
        gender: user?.gender || 'Male',
        hypertension: false,
        heart_disease: false,
        diabetes: false,
        bmi: '',
        height: '',
        weight: '',
        bmiMode: 'direct', // 'direct' or 'calculate'
        avg_glucose_level: '',
        smoking_status: 'never',
        ever_married: false,
        work_type: 'Private',
        residence_type: 'Urban',
        clinical_notes: '',
        // Issue #5: Temporal context
        assessment_reason: 'routine_screening',
        symptom_onset_time: '',
        symptoms_during_recording: false,
    });

    useEffect(() => {
        return () => {
            if (timerInterval) clearInterval(timerInterval);
        };
    }, [timerInterval]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData({
            ...formData,
            [name]: type === 'checkbox' ? checked : value,
        });
        setError('');
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
            const source = context.createMediaStreamSource(stream);
            const processor = context.createScriptProcessor(4096, 1, 1);

            setAudioContext(context);
            setAudioStream(stream);
            setProcessor(processor);

            const chunks = [];
            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                chunks.push(new Float32Array(inputData));
            };

            source.connect(processor);
            processor.connect(context.destination);

            setAudioChunks(chunks);
            setIsRecording(true);
            setRecordingDuration(0);

            const interval = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);
            setTimerInterval(interval);
        } catch (err) {
            console.error(err);
            setError('Could not access microphone. Please check permissions.');
        }
    };

    const stopRecording = () => {
        if (isRecording) {
            if (processor && audioContext) {
                processor.disconnect();
                audioContext.close();
            }

            if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
            }

            // Flatten chunks
            const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const resultBuffer = new Float32Array(totalLength);
            let offset = 0;
            for (const chunk of audioChunks) {
                resultBuffer.set(chunk, offset);
                offset += chunk.length;
            }

            // Encode to WAV
            const wavData = encodeWAV(resultBuffer, 44100);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            const file = new File([blob], `recording_${Date.now()}.wav`, { type: 'audio/wav' });

            setAudioFile(file);
            setIsRecording(false);
            clearInterval(timerInterval);

            // Cleanup
            setAudioStream(null);
            setProcessor(null);
            setAudioContext(null);
            setAudioChunks([]);
        }
    };

    const handleAudioChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/flac', 'audio/m4a', 'audio/x-m4a'];
            if (!allowedTypes.includes(file.type) && !file.name.match(/\.(wav|mp3|ogg|flac|m4a)$/i)) {
                setError('Please upload a valid audio file (WAV, MP3, OGG, FLAC, M4A)');
                return;
            }
            setAudioFile(file);
            setError('');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Basic validation (age removed - auto-calculated from DOB)
            if (!formData.gender) {
                setStep(1);
                setError('Gender is required for clinical assessment.');
                setLoading(false);
                return;
            }

            // Create form data for multipart upload
            const submitData = new FormData();

            // Add clinical data
            Object.keys(formData).forEach(key => {
                submitData.append(key, formData[key]);
            });

            // Add audio if provided
            if (audioFile) {
                submitData.append('audio_file', audioFile);
            }

            const response = await triageAPI.completeAssessment(submitData);

            // Navigate to result page
            navigate(`/patient/result/${response.data.triage_result.triage_result_id}`);
        } catch (err) {
            setError(err.response?.data?.error || 'Assessment failed. Please try again.');
            setLoading(false);
        }
    };

    const nextStep = () => {
        if (step === 1 && !formData.gender) {
            setError('Please select your gender');
            return;
        }
        setStep(step + 1);
        setError('');
    };

    const prevStep = () => {
        setStep(step - 1);
        setError('');
    };

    return (
        <div className="min-h-screen p-6">
            <div className="container max-w-2xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Link to="/patient" className="btn btn-secondary btn-sm">
                        <ArrowLeft size={18} />
                    </Link>
                    <div>
                        <div className="flex items-center gap-2">
                            <Activity size={24} style={{ color: '#3b82f6' }} />
                            <h1 className="text-2xl font-bold mb-0">Clinical Assessment</h1>
                        </div>
                        <p className="text-secondary text-sm">Complete the form for triage evaluation</p>
                    </div>
                </div>

                {/* Progress Steps */}
                <div className="flex items-center justify-center gap-4 mb-8">
                    {[1, 2, 3].map((s) => (
                        <div key={s} className="flex items-center">
                            <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${step >= s ? 'text-white' : 'text-muted'
                                    }`}
                                style={{
                                    background: step >= s ? '#3b82f6' : 'rgba(99,102,241,0.08)',
                                    border: step >= s ? 'none' : '1px solid rgba(99,102,241,0.15)'
                                }}
                            >
                                {step > s ? <CheckCircle size={20} /> : s}
                            </div>
                            {s < 3 && (
                                <div
                                    className="w-16 h-1 mx-2"
                                    style={{ background: step > s ? '#3b82f6' : 'rgba(99,102,241,0.10)' }}
                                />
                            )}
                        </div>
                    ))}
                </div>

                {/* Form Card */}
                <div className="glass-card-static">
                    <form onSubmit={handleSubmit}>
                        {/* Error Message */}
                        {error && (
                            <div className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
                                <AlertCircle size={18} />
                                <span className="text-sm">{error}</span>
                            </div>
                        )}

                        {/* Step 1: Demographics */}
                        {step === 1 && (
                            <div>
                                <div className="flex items-center gap-2 mb-6">
                                    <User size={20} style={{ color: '#3b82f6' }} />
                                    <h2 className="text-lg font-semibold mb-0">Demographics</h2>
                                </div>

                                {/* Age removed - auto-calculated from DOB */}
                                <div className="p-4 rounded-lg mb-4" style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                                    <p className="text-sm" style={{ color: '#2563eb' }}>
                                        ℹ️ Your <strong>age</strong> and <strong>gender ({user?.gender || 'not set'})</strong> are automatically pulled from your profile.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="input-group">
                                        <label className="input-label">Work Type</label>
                                        <select name="work_type" className="select" value={formData.work_type} onChange={handleChange}>
                                            <option value="Private">Private</option>
                                            <option value="Self-employed">Self-employed</option>
                                            <option value="Govt_job">Government</option>
                                            <option value="children">Children</option>
                                            <option value="Never_worked">Never worked</option>
                                        </select>
                                    </div>
                                    <div className="input-group">
                                        <label className="input-label">Residence</label>
                                        <select name="residence_type" className="select" value={formData.residence_type} onChange={handleChange}>
                                            <option value="Urban">Urban</option>
                                            <option value="Rural">Rural</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="checkbox-group mt-4">
                                    <input
                                        type="checkbox"
                                        id="ever_married"
                                        name="ever_married"
                                        className="checkbox"
                                        checked={formData.ever_married}
                                        onChange={handleChange}
                                    />
                                    <label htmlFor="ever_married" className="text-secondary">Ever married</label>
                                </div>

                                {/* Issue #5: Assessment Reason */}
                                <div className="mt-6 p-4 rounded-lg" style={{ background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <Clock size={18} style={{ color: '#d97706' }} />
                                        <span className="font-semibold text-sm" style={{ color: '#d97706' }}>Assessment Context</span>
                                    </div>
                                    <div className="input-group mb-3">
                                        <label className="input-label">Reason for this assessment *</label>
                                        <select name="assessment_reason" className="select" value={formData.assessment_reason} onChange={handleChange}>
                                            <option value="routine_screening">Routine Screening / Check-up</option>
                                            <option value="active_symptoms">I am experiencing symptoms NOW</option>
                                            <option value="follow_up">Follow-up from previous assessment</option>
                                        </select>
                                    </div>

                                    {formData.assessment_reason === 'active_symptoms' && (
                                        <>
                                            <div className="p-3 rounded-lg mb-3" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                                                <div className="flex items-center gap-2">
                                                    <AlertTriangle size={18} style={{ color: '#ef4444' }} />
                                                    <span className="text-sm font-bold" style={{ color: '#ef4444' }}>
                                                        If you are experiencing stroke symptoms, CALL 911 IMMEDIATELY
                                                    </span>
                                                </div>
                                                <p className="text-xs mt-1" style={{ color: '#dc2626' }}>
                                                    Stroke treatment is most effective within 4.5 hours of symptom onset.
                                                </p>
                                            </div>
                                            <div className="input-group">
                                                <label className="input-label">When did symptoms start?</label>
                                                <input
                                                    type="datetime-local"
                                                    name="symptom_onset_time"
                                                    className="input"
                                                    value={formData.symptom_onset_time}
                                                    onChange={handleChange}
                                                    max={new Date().toISOString().slice(0, 16)}
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Step 2: Risk Factors */}
                        {step === 2 && (
                            <div>
                                <div className="flex items-center gap-2 mb-6">
                                    <Heart size={20} style={{ color: '#ef4444' }} />
                                    <h2 className="text-lg font-semibold mb-0">Vascular Risk Factors</h2>
                                </div>

                                <div className="space-y-4 mb-6">
                                    <div className="checkbox-group p-4 rounded-lg" style={{ background: 'rgba(99,102,241,0.05)' }}>
                                        <input
                                            type="checkbox"
                                            id="hypertension"
                                            name="hypertension"
                                            className="checkbox"
                                            checked={formData.hypertension}
                                            onChange={handleChange}
                                        />
                                        <label htmlFor="hypertension">
                                            <span className="font-medium">Hypertension</span>
                                            <p className="text-sm text-muted">High blood pressure diagnosis</p>
                                        </label>
                                    </div>

                                    <div className="checkbox-group p-4 rounded-lg" style={{ background: 'rgba(99,102,241,0.05)' }}>
                                        <input
                                            type="checkbox"
                                            id="heart_disease"
                                            name="heart_disease"
                                            className="checkbox"
                                            checked={formData.heart_disease}
                                            onChange={handleChange}
                                        />
                                        <label htmlFor="heart_disease">
                                            <span className="font-medium">Heart Disease</span>
                                            <p className="text-sm text-muted">History of cardiac conditions</p>
                                        </label>
                                    </div>

                                    <div className="checkbox-group p-4 rounded-lg" style={{ background: 'rgba(99,102,241,0.05)' }}>
                                        <input
                                            type="checkbox"
                                            id="diabetes"
                                            name="diabetes"
                                            className="checkbox"
                                            checked={formData.diabetes}
                                            onChange={handleChange}
                                        />
                                        <label htmlFor="diabetes">
                                            <span className="font-medium">Diabetes Mellitus</span>
                                            <p className="text-sm text-muted">Type 1 or Type 2 diabetes</p>
                                        </label>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 mb-4 mt-8">
                                    <Thermometer size={20} style={{ color: '#f59e0b' }} />
                                    <h3 className="font-semibold mb-0">Metabolic Indicators</h3>
                                </div>

                                <div className="space-y-4">
                                    {/* BMI Mode Toggle */}
                                    <div className="flex gap-2 mb-4">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, bmiMode: 'direct' })}
                                            className={`btn btn-sm flex-1 ${formData.bmiMode === 'direct' ? 'btn-primary' : 'btn-secondary'}`}
                                        >
                                            Enter BMI
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, bmiMode: 'calculate' })}
                                            className={`btn btn-sm flex-1 ${formData.bmiMode === 'calculate' ? 'btn-primary' : 'btn-secondary'}`}
                                        >
                                            Calculate BMI
                                        </button>
                                    </div>

                                    {formData.bmiMode === 'direct' ? (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="input-group">
                                                <label className="input-label">BMI (kg/m²)</label>
                                                <input
                                                    type="number"
                                                    name="bmi"
                                                    className="input"
                                                    placeholder="e.g., 24.5"
                                                    value={formData.bmi}
                                                    onChange={handleChange}
                                                    step="0.1"
                                                    min="10"
                                                    max="60"
                                                />
                                            </div>
                                            <div className="input-group">
                                                <label className="input-label">Avg Glucose (mg/dL)</label>
                                                <input
                                                    type="number"
                                                    name="avg_glucose_level"
                                                    className="input"
                                                    placeholder="e.g., 100"
                                                    value={formData.avg_glucose_level}
                                                    onChange={handleChange}
                                                    min="50"
                                                    max="400"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="input-group">
                                                    <label className="input-label">Height (cm)</label>
                                                    <input
                                                        type="number"
                                                        name="height"
                                                        className="input"
                                                        placeholder="e.g., 170"
                                                        value={formData.height}
                                                        onChange={(e) => {
                                                            const height = e.target.value;
                                                            const weight = formData.weight;
                                                            let bmi = '';
                                                            if (height && weight && parseFloat(height) > 0) {
                                                                const heightM = parseFloat(height) / 100;
                                                                bmi = (parseFloat(weight) / (heightM * heightM)).toFixed(1);
                                                            }
                                                            setFormData({ ...formData, height, bmi });
                                                        }}
                                                        min="50"
                                                        max="250"
                                                    />
                                                </div>
                                                <div className="input-group">
                                                    <label className="input-label">Weight (kg)</label>
                                                    <input
                                                        type="number"
                                                        name="weight"
                                                        className="input"
                                                        placeholder="e.g., 70"
                                                        value={formData.weight}
                                                        onChange={(e) => {
                                                            const weight = e.target.value;
                                                            const height = formData.height;
                                                            let bmi = '';
                                                            if (height && weight && parseFloat(height) > 0) {
                                                                const heightM = parseFloat(height) / 100;
                                                                bmi = (parseFloat(weight) / (heightM * heightM)).toFixed(1);
                                                            }
                                                            setFormData({ ...formData, weight, bmi });
                                                        }}
                                                        min="20"
                                                        max="300"
                                                    />
                                                </div>
                                            </div>

                                            {/* Calculated BMI Display */}
                                            {formData.bmi && (
                                                <div className="p-4 rounded-lg" style={{ background: 'rgba(99,102,241,0.06)' }}>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-secondary">Calculated BMI:</span>
                                                        <div className="text-right">
                                                            <span className="text-xl font-bold">{formData.bmi}</span>
                                                            <span className="text-sm ml-2" style={{
                                                                color: parseFloat(formData.bmi) < 18.5 ? '#60a5fa' :
                                                                    parseFloat(formData.bmi) < 25 ? '#10b981' :
                                                                        parseFloat(formData.bmi) < 30 ? '#f59e0b' : '#ef4444'
                                                            }}>
                                                                {parseFloat(formData.bmi) < 18.5 ? 'Underweight' :
                                                                    parseFloat(formData.bmi) < 25 ? 'Normal' :
                                                                        parseFloat(formData.bmi) < 30 ? 'Overweight' : 'Obese'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="input-group">
                                                <label className="input-label">Avg Glucose (mg/dL)</label>
                                                <input
                                                    type="number"
                                                    name="avg_glucose_level"
                                                    className="input"
                                                    placeholder="e.g., 100"
                                                    value={formData.avg_glucose_level}
                                                    onChange={handleChange}
                                                    min="50"
                                                    max="400"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 mb-4 mt-8">
                                    <Cigarette size={20} style={{ color: '#94a3b8' }} />
                                    <h3 className="font-semibold mb-0">Lifestyle</h3>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Smoking Status</label>
                                    <select name="smoking_status" className="select" value={formData.smoking_status} onChange={handleChange}>
                                        <option value="never">Never smoked</option>
                                        <option value="formerly">Former smoker</option>
                                        <option value="current">Current smoker</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Audio & Notes */}
                        {step === 3 && (
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Mic size={20} style={{ color: '#10b981' }} />
                                    <h2 className="text-lg font-semibold mb-0">Voice & Speech Analysis</h2>
                                </div>
                                <p className="text-sm text-muted mb-6">
                                    Optional but highly recommended. Speech analysis increases assessment accuracy.
                                </p>

                                {/* Issue #5: Symptoms during recording indicator */}
                                {formData.assessment_reason === 'active_symptoms' && (
                                    <div className="checkbox-group p-4 rounded-lg mb-4" style={{ background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                        <input
                                            type="checkbox"
                                            id="symptoms_during_recording"
                                            name="symptoms_during_recording"
                                            className="checkbox"
                                            checked={formData.symptoms_during_recording}
                                            onChange={handleChange}
                                        />
                                        <label htmlFor="symptoms_during_recording">
                                            <span className="font-medium" style={{ color: '#d97706' }}>I am currently experiencing symptoms</span>
                                            <p className="text-xs text-muted">Check this if you have active symptoms while recording your voice sample</p>
                                        </label>
                                    </div>
                                )}

                                <div className="glass-card mb-6 overflow-hidden">
                                    {audioFile ? (
                                        <div className="p-6 text-center">
                                            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(16, 185, 129, 0.12)' }}>
                                                <CheckCircle size={32} style={{ color: '#10b981' }} />
                                            </div>
                                            <h4 className="font-semibold mb-1">{audioFile.name}</h4>
                                            <p className="text-secondary text-sm mb-4">
                                                {(audioFile.size / 1024 / 1024).toFixed(2)} MB • Ready for analysis
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => setAudioFile(null)}
                                                className="btn btn-secondary btn-sm"
                                            >
                                                Change Sample
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-white/10">
                                            {/* Record Option */}
                                            <div className="p-8 text-center">
                                                {isRecording ? (
                                                    <div>
                                                        <div className="relative w-20 h-20 mx-auto mb-6">
                                                            <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
                                                            <div className="absolute inset-0 rounded-full bg-red-500/40 flex items-center justify-center">
                                                                <Mic size={32} className="text-red-500" />
                                                            </div>
                                                        </div>
                                                        <p className="font-bold text-xl mb-2">
                                                            {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                                                        </p>
                                                        <p className="text-sm text-secondary mb-6">Recording in progress...</p>
                                                        <button
                                                            type="button"
                                                            onClick={stopRecording}
                                                            className="btn btn-emergency w-full"
                                                        >
                                                            Stop Recording
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-primary-500/20">
                                                            <Mic size={32} className="text-primary-500" />
                                                        </div>
                                                        <h4 className="font-semibold mb-2">Record Live</h4>
                                                        <p className="text-xs text-secondary mb-6">Speak clearly for 10-30 seconds</p>
                                                        <button
                                                            type="button"
                                                            onClick={startRecording}
                                                            className="btn btn-primary w-full"
                                                        >
                                                            Start Recording
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Upload Option */}
                                            <div className="p-8 text-center">
                                                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-white/5">
                                                    <Upload size={32} className="text-muted" />
                                                </div>
                                                <h4 className="font-semibold mb-2">Upload File</h4>
                                                <p className="text-xs text-secondary mb-6">WAV, MP3, OGG, FLAC, M4A</p>
                                                <label className="btn btn-secondary w-full cursor-pointer">
                                                    Choose File
                                                    <input
                                                        type="file"
                                                        accept=".wav,.mp3,.ogg,.flac,.m4a,audio/*"
                                                        onChange={handleAudioChange}
                                                        className="hidden"
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {!audioFile && (
                                    <div className="p-4 rounded-lg mb-6 flex gap-3" style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                                        <AlertCircle size={20} className="text-yellow-500 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium" style={{ color: '#92400e' }}>No audio provided</p>
                                            <p className="text-xs mt-1" style={{ color: '#a16207' }}>
                                                Proceeding without audio analysis will result in a lower confidence score.
                                                We recommend recording a sample if possible.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <p className="text-sm text-muted mb-6">
                                    💡 Speech analysis can help detect early signs of neurological changes.
                                    Record yourself speaking naturally for 10-30 seconds.
                                </p>

                                <div className="input-group">
                                    <label className="input-label">Clinical Notes (Optional)</label>
                                    <textarea
                                        name="clinical_notes"
                                        className="input"
                                        rows="4"
                                        placeholder="Any additional symptoms or concerns..."
                                        value={formData.clinical_notes}
                                        onChange={handleChange}
                                        style={{ resize: 'vertical' }}
                                    />
                                </div>

                            </div>
                        )}

                        {/* Navigation Buttons */}
                        <div className="flex justify-between mt-8">
                            {step > 1 ? (
                                <button type="button" onClick={prevStep} className="btn btn-secondary">
                                    <ArrowLeft size={18} />
                                    Previous
                                </button>
                            ) : (
                                <div />
                            )}

                            {step < 3 ? (
                                <button type="button" onClick={nextStep} className="btn btn-primary">
                                    Next
                                    <ChevronRight size={18} />
                                </button>
                            ) : (
                                <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
                                    {loading ? (
                                        <>
                                            <div className="spinner" style={{ width: '1.25rem', height: '1.25rem' }} />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <Activity size={18} />
                                            Submit Assessment
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                {/* Disclaimer */}
                <div className="disclaimer mt-8">
                    <p className="text-sm">
                        ⚕️ This assessment is for early warning purposes only. It does not provide
                        a medical diagnosis. If you are experiencing stroke symptoms (sudden numbness,
                        confusion, vision problems, difficulty walking, severe headache),
                        <strong> call 911 immediately</strong>.
                    </p>
                </div>
            </div>
        </div>
    );
}
