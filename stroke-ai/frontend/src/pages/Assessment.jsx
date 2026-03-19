import { useState, useEffect, useRef, useMemo } from 'react';
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
    Camera,
    Video,
    VideoOff,
    Square,
    ClipboardList,
} from 'lucide-react';
import { encodeWAV } from '../utils/waveEncoder';

export default function Assessment() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialStep = parseInt(searchParams.get('step')) || 0;
    const { user } = useAuth();

    // Core state
    const [step, setStep] = useState(initialStep);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Modality selection — patient picks which assessments to undergo
    const [selectedModalities, setSelectedModalities] = useState({
        clinical: true,   // Always required
        audio: searchParams.get('step') === '3',  // Pre-select if ?step=3
        video: false,
    });

    // Dynamic steps based on selected modalities
    // Step 0 is always the selection screen
    const stepSequence = useMemo(() => {
        const steps = [
            { id: 'select', label: 'Select' },
            { id: 'clinical', label: 'Clinical' },
            { id: 'review', label: 'Review' },
        ];
        if (selectedModalities.audio) steps.push({ id: 'audio', label: 'Audio' });
        if (selectedModalities.video) steps.push({ id: 'video', label: 'Video' });
        return steps;
    }, [selectedModalities]);

    const currentStepId = stepSequence[step]?.id || 'select';

    // File & recording state
    const [audioFile, setAudioFile] = useState(null);
    const [videoFile, setVideoFile] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [timerInterval, setTimerInterval] = useState(null);
    const [audioContext, setAudioContext] = useState(null);
    const [audioStream, setAudioStream] = useState(null);
    const [processor, setProcessor] = useState(null);
    const [audioChunks, setAudioChunks] = useState([]);

    // Video recording state
    const [isVideoRecording, setIsVideoRecording] = useState(false);
    const [videoRecordingDuration, setVideoRecordingDuration] = useState(0);
    const [videoTimerInterval, setVideoTimerInterval] = useState(null);
    const [videoStream, setVideoStream] = useState(null);
    const videoPreviewRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const videoChunksRef = useRef([]);

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
            if (videoTimerInterval) clearInterval(videoTimerInterval);
            // Cleanup video stream on unmount
            if (videoStream) {
                videoStream.getTracks().forEach(track => track.stop());
            }
        };
    }, [timerInterval, videoTimerInterval, videoStream]);

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

    const handleVideoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/avi'];
            if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp4|webm|ogg|avi|mov)$/i)) {
                setError('Please upload a valid video file (MP4, WEBM, OGG, AVI)');
                return;
            }
            setVideoFile(file);
            setError('');
        }
    };

    const startVideoRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false
            });
            setVideoStream(stream);

            // Connect preview
            if (videoPreviewRef.current) {
                videoPreviewRef.current.srcObject = stream;
            }

            // Setup MediaRecorder
            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                ? 'video/webm;codecs=vp9'
                : MediaRecorder.isTypeSupported('video/webm')
                    ? 'video/webm'
                    : 'video/mp4';

            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;
            videoChunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    videoChunksRef.current.push(e.data);
                }
            };

            recorder.onstop = () => {
                const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
                const blob = new Blob(videoChunksRef.current, { type: mimeType });
                const file = new File([blob], `face_recording_${Date.now()}.${ext}`, { type: mimeType });
                setVideoFile(file);

                // Stop camera
                stream.getTracks().forEach(track => track.stop());
                setVideoStream(null);
            };

            recorder.start(1000); // Collect data every 1s
            setIsVideoRecording(true);
            setVideoRecordingDuration(0);

            const interval = setInterval(() => {
                setVideoRecordingDuration(prev => prev + 1);
            }, 1000);
            setVideoTimerInterval(interval);
        } catch (err) {
            console.error(err);
            setError('Could not access camera. Please check permissions and try again.');
        }
    };

    const stopVideoRecording = () => {
        if (mediaRecorderRef.current && isVideoRecording) {
            mediaRecorderRef.current.stop();
            setIsVideoRecording(false);
            clearInterval(videoTimerInterval);
            setVideoTimerInterval(null);
        }
    };

    const handleSubmit = async () => {

        // Only actually submit on the final step
        if (step < stepSequence.length - 1) {
            nextStep();
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Validate required files based on selected modalities
            if (selectedModalities.audio && !audioFile) {
                setError('Please record or upload an audio sample before submitting.');
                setLoading(false);
                return;
            }
            if (selectedModalities.video && !videoFile) {
                setError('Please record or upload a video before submitting.');
                setLoading(false);
                return;
            }

            // Basic validation
            if (!formData.gender) {
                setStep(1);
                setError('Gender is required for clinical assessment.');
                setLoading(false);
                return;
            }

            const submitData = new FormData();

            Object.keys(formData).forEach(key => {
                submitData.append(key, formData[key]);
            });

            if (audioFile) {
                submitData.append('audio_file', audioFile);
            }

            if (videoFile) {
                submitData.append('video_file', videoFile);
            }

            const response = await triageAPI.completeAssessment(submitData);
            navigate(`/patient/result/${response.data.triage_result.triage_result_id}`);
        } catch (err) {
            setError(err.response?.data?.error || 'Assessment failed. Please try again.');
            setLoading(false);
        }
    };

    const nextStep = () => {
        if (currentStepId === 'select') {
            setStep(1);
            setError('');
            return;
        }
        if (currentStepId === 'clinical' && !formData.gender) {
            setError('Please select your gender');
            return;
        }
        if (currentStepId === 'audio' && !audioFile) {
            setError('Please record or upload an audio sample before proceeding.');
            return;
        }
        if (currentStepId === 'video' && !videoFile) {
            setError('Please record or upload a video before proceeding.');
            return;
        }
        if (step < stepSequence.length - 1) {
            setStep(step + 1);
            setError('');
        }
    };

    const prevStep = () => {
        if (step > 0) {
            setStep(step - 1);
            setError('');
        }
    };

    const isLastStep = step === stepSequence.length - 1;

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

                {/* Progress Steps (only show after selection) */}
                {step > 0 && (
                    <div className="flex items-center justify-center gap-3 mb-8">
                        {stepSequence.slice(1).map((s, idx) => {
                            const stepNum = idx + 1;
                            return (
                                <div key={s.id} className="flex items-center">
                                    <div className="flex flex-col items-center gap-1">
                                        <div
                                            className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${step >= stepNum ? 'text-white' : 'text-muted'}`}
                                            style={{
                                                background: step >= stepNum ? '#3b82f6' : 'rgba(99,102,241,0.08)',
                                                border: step >= stepNum ? 'none' : '1px solid rgba(99,102,241,0.15)'
                                            }}
                                        >
                                            {step > stepNum ? <CheckCircle size={20} /> : stepNum}
                                        </div>
                                        <span className="text-xs text-muted">{s.label}</span>
                                    </div>
                                    {idx < stepSequence.length - 2 && (
                                        <div
                                            className="w-12 h-1 mx-1 mb-4"
                                            style={{ background: step > stepNum ? '#3b82f6' : 'rgba(99,102,241,0.10)' }}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Step 0: Assessment Type Selection */}
                {step === 0 && (
                    <div className="glass-card-static">
                        <div className="flex items-center gap-2 mb-2">
                            <ClipboardList size={20} style={{ color: '#3b82f6' }} />
                            <h2 className="text-lg font-semibold mb-0">Choose Your Assessments</h2>
                        </div>
                        <p className="text-sm text-muted mb-6">
                            Select which types of analysis you'd like to include. More modalities = higher accuracy.
                        </p>

                        {error && (
                            <div className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
                                <AlertCircle size={18} />
                                <span className="text-sm">{error}</span>
                            </div>
                        )}

                        <div className="space-y-4">
                            {/* Clinical — always on */}
                            <div className="p-5 rounded-xl flex items-center gap-4" style={{ background: 'rgba(59, 130, 246, 0.08)', border: '2px solid rgba(59, 130, 246, 0.3)' }}>
                                <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(59, 130, 246, 0.15)' }}>
                                    <ClipboardList size={28} style={{ color: '#3b82f6' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h3 className="font-semibold mb-0.5">Clinical Assessment</h3>
                                    <p className="text-xs text-muted">Medical history, risk factors, demographics</p>
                                </div>
                                <span className="text-xs font-medium px-3 py-1 rounded-full" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>Required</span>
                            </div>

                            {/* Audio */}
                            <label className="p-5 rounded-xl flex items-center gap-4 cursor-pointer transition-all" style={{
                                background: selectedModalities.audio ? 'rgba(16, 185, 129, 0.08)' : 'rgba(99,102,241,0.04)',
                                border: selectedModalities.audio ? '2px solid rgba(16, 185, 129, 0.3)' : '2px solid rgba(99,102,241,0.1)',
                            }}>
                                <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: selectedModalities.audio ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99,102,241,0.06)' }}>
                                    <Mic size={28} style={{ color: selectedModalities.audio ? '#10b981' : '#64748b' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h3 className="font-semibold mb-0.5">Voice / Speech Analysis</h3>
                                    <p className="text-xs text-muted">Record or upload speech for dysarthria detection</p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={selectedModalities.audio}
                                    onChange={(e) => setSelectedModalities(prev => ({ ...prev, audio: e.target.checked }))}
                                    className="checkbox"
                                    style={{ width: 22, height: 22 }}
                                />
                            </label>

                            {/* Video */}
                            <label className="p-5 rounded-xl flex items-center gap-4 cursor-pointer transition-all" style={{
                                background: selectedModalities.video ? 'rgba(139, 92, 246, 0.08)' : 'rgba(99,102,241,0.04)',
                                border: selectedModalities.video ? '2px solid rgba(139, 92, 246, 0.3)' : '2px solid rgba(99,102,241,0.1)',
                            }}>
                                <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: selectedModalities.video ? 'rgba(139, 92, 246, 0.15)' : 'rgba(99,102,241,0.06)' }}>
                                    <Camera size={28} style={{ color: selectedModalities.video ? '#8b5cf6' : '#64748b' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h3 className="font-semibold mb-0.5">Facial Video Analysis</h3>
                                    <p className="text-xs text-muted">Record or upload face video for asymmetry detection</p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={selectedModalities.video}
                                    onChange={(e) => setSelectedModalities(prev => ({ ...prev, video: e.target.checked }))}
                                    className="checkbox"
                                    style={{ width: 22, height: 22 }}
                                />
                            </label>
                        </div>

                        <div className="mt-6 p-4 rounded-lg" style={{ background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
                            <p className="text-xs text-secondary">
                                💡 <strong>Tip:</strong> Selecting all three assessments provides the highest accuracy ({selectedModalities.audio && selectedModalities.video ? '90%' : selectedModalities.audio || selectedModalities.video ? '85%' : '65%'} base confidence).
                            </p>
                        </div>

                        <div className="flex justify-end mt-6">
                            <button type="button" onClick={nextStep} className="btn btn-primary">
                                Start Assessment
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Form (steps 1+) */}
                {step > 0 && (
                    <div className="glass-card-static">
                        <form onSubmit={(e) => e.preventDefault()}>
                            {/* Error Message */}
                            {error && (
                                <div className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
                                    <AlertCircle size={18} />
                                    <span className="text-sm">{error}</span>
                                </div>
                            )}

                            {/* Step 1: Demographics */}
                            {currentStepId === 'clinical' && (
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
                            {currentStepId === 'review' && (
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
                            {currentStepId === 'audio' && (
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

                                </div>
                            )}

                            {/* Step 4: Facial Video Analysis */}
                            {currentStepId === 'video' && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Camera size={20} style={{ color: '#8b5cf6' }} />
                                        <h2 className="text-lg font-semibold mb-0">Facial Video Analysis</h2>
                                    </div>
                                    <p className="text-sm text-muted mb-4">
                                        Optional. Record a short video of your face for facial asymmetry analysis (stroke detection).
                                    </p>

                                    <div className="glass-card overflow-hidden">
                                        {videoFile && !isVideoRecording ? (
                                            <div className="p-6 text-center">
                                                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(139, 92, 246, 0.12)' }}>
                                                    <CheckCircle size={32} style={{ color: '#8b5cf6' }} />
                                                </div>
                                                <h4 className="font-semibold mb-1">{videoFile.name}</h4>
                                                <p className="text-secondary text-sm mb-4">
                                                    {(videoFile.size / 1024 / 1024).toFixed(2)} MB • Ready for analysis
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => setVideoFile(null)}
                                                    className="btn btn-secondary btn-sm"
                                                >
                                                    Remove Video
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-white/10">
                                                {/* Record Option */}
                                                <div className="p-8 text-center">
                                                    {isVideoRecording ? (
                                                        <div>
                                                            {/* Live Camera Preview */}
                                                            <div className="relative w-full max-w-[280px] mx-auto mb-4 rounded-lg overflow-hidden" style={{ aspectRatio: '4/3', background: '#000' }}>
                                                                <video
                                                                    ref={videoPreviewRef}
                                                                    autoPlay
                                                                    playsInline
                                                                    muted
                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                                                                />
                                                                <div className="absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1" style={{ background: 'rgba(239, 68, 68, 0.85)', color: '#fff' }}>
                                                                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                                                    REC
                                                                </div>
                                                            </div>
                                                            <p className="font-bold text-xl mb-2">
                                                                {Math.floor(videoRecordingDuration / 60)}:{(videoRecordingDuration % 60).toString().padStart(2, '0')}
                                                            </p>
                                                            <p className="text-sm text-secondary mb-4">Recording your face...</p>
                                                            <button
                                                                type="button"
                                                                onClick={stopVideoRecording}
                                                                className="btn btn-emergency w-full flex items-center justify-center gap-2"
                                                            >
                                                                <Square size={16} />
                                                                Stop Recording
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(139, 92, 246, 0.15)' }}>
                                                                <Video size={32} style={{ color: '#8b5cf6' }} />
                                                            </div>
                                                            <h4 className="font-semibold mb-2">Record Face Video</h4>
                                                            <p className="text-xs text-secondary mb-6">Look at the camera for 5-10 seconds</p>
                                                            <button
                                                                type="button"
                                                                onClick={startVideoRecording}
                                                                className="btn w-full"
                                                                style={{ background: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.4)', color: '#a78bfa' }}
                                                            >
                                                                <Camera size={18} />
                                                                Start Camera
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Upload Option */}
                                                <div className="p-8 text-center">
                                                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(139, 92, 246, 0.08)' }}>
                                                        <Upload size={32} style={{ color: '#7c3aed' }} />
                                                    </div>
                                                    <h4 className="font-semibold mb-2">Upload Video</h4>
                                                    <p className="text-xs text-secondary mb-6">MP4, WEBM, OGG, AVI</p>
                                                    <label className="btn btn-secondary w-full cursor-pointer">
                                                        Choose File
                                                        <input
                                                            type="file"
                                                            accept=".mp4,.webm,.ogg,.avi,.mov,video/*"
                                                            onChange={handleVideoChange}
                                                            className="hidden"
                                                        />
                                                    </label>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {!videoFile && !isVideoRecording && (
                                        <p className="text-xs text-muted mt-2">
                                            🎥 Record or upload a short video of your face. The system analyzes eye, eyebrow,
                                            and mouth regions for asymmetry patterns associated with stroke.
                                        </p>
                                    )}

                                    <div className="input-group mt-6">
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

                                {!isLastStep ? (
                                    <button type="button" onClick={nextStep} className="btn btn-primary">
                                        Next
                                        <ChevronRight size={18} />
                                    </button>
                                ) : (
                                    <button type="button" onClick={handleSubmit} className="btn btn-primary btn-lg" disabled={loading}>
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
                )}

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
