/**
 * Video Assessment Page
 * Standalone video-based stroke detection through facial asymmetry analysis.
 * Independent from the main clinical assessment page.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { triageAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
    ArrowLeft,
    Camera,
    Video,
    VideoOff,
    Square,
    Upload,
    CheckCircle,
    AlertCircle,
    Activity,
    Eye,
    AlertTriangle,
} from 'lucide-react';

export default function VideoAssessment() {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [videoFile, setVideoFile] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [timerInterval, setTimerInterval] = useState(null);
    const [videoStream, setVideoStream] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    const videoPreviewRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const videoChunksRef = useRef([]);

    useEffect(() => {
        return () => {
            if (timerInterval) clearInterval(timerInterval);
            if (videoStream) {
                videoStream.getTracks().forEach(track => track.stop());
            }
        };
    }, [timerInterval, videoStream]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false
            });
            setVideoStream(stream);

            if (videoPreviewRef.current) {
                videoPreviewRef.current.srcObject = stream;
            }

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

                stream.getTracks().forEach(track => track.stop());
                setVideoStream(null);
            };

            recorder.start(1000);
            setIsRecording(true);
            setRecordingDuration(0);

            const interval = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);
            setTimerInterval(interval);
        } catch (err) {
            console.error(err);
            setError('Could not access camera. Please check permissions and try again.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(timerInterval);
            setTimerInterval(null);
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

    const handleSubmit = async () => {
        if (!videoFile) {
            setError('Please record or upload a video first.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const formData = new FormData();
            formData.append('video_file', videoFile);
            const response = await triageAPI.uploadVideo(formData);
            setResult(response.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Video analysis failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const resetAssessment = () => {
        setVideoFile(null);
        setResult(null);
        setError('');
    };

    // Parse video data for result display
    const getVideoData = () => {
        if (!result?.video_result) return null;
        return result.video_result;
    };

    const getSeverityColor = (severity) => {
        switch (severity) {
            case 'Severe': return '#ef4444';
            case 'Moderate Severe': return '#f97316';
            case 'Moderate': return '#f59e0b';
            case 'Mild': return '#10b981';
            default: return '#64748b';
        }
    };

    const videoData = getVideoData();

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
                            <Camera size={24} style={{ color: '#8b5cf6' }} />
                            <h1 className="text-2xl font-bold mb-0">Video Stroke Assessment</h1>
                        </div>
                        <p className="text-secondary text-sm">Facial asymmetry analysis for early stroke detection</p>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
                        <AlertCircle size={18} />
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                {/* Result Display */}
                {result && videoData ? (
                    <div className="space-y-6 fade-in">
                        {/* Severity Header */}
                        <div className="glass-card-static text-center p-8">
                            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                                style={{ background: `${getSeverityColor(videoData.severity)}18`, border: `2px solid ${getSeverityColor(videoData.severity)}40` }}>
                                <Camera size={36} style={{ color: getSeverityColor(videoData.severity) }} />
                            </div>
                            <h2 className="text-2xl font-bold mb-2">Facial Analysis Complete</h2>
                            <span className="px-4 py-2 rounded-full font-bold text-sm"
                                style={{
                                    background: `${getSeverityColor(videoData.severity)}18`,
                                    color: getSeverityColor(videoData.severity),
                                    border: `1px solid ${getSeverityColor(videoData.severity)}40`
                                }}>
                                {videoData.severity?.toUpperCase()} SEVERITY
                            </span>
                            {videoData.risk_score != null && (
                                <p className="text-4xl font-bold mt-4" style={{ color: getSeverityColor(videoData.severity) }}>
                                    {(videoData.risk_score * 100).toFixed(0)}%
                                </p>
                            )}
                            <p className="text-sm text-secondary mt-1">Overall Facial Risk Score</p>
                        </div>

                        {/* Region Breakdown */}
                        {videoData.region_scores && (
                            <div className="glass-card-static">
                                <h3 className="font-semibold mb-4 flex items-center gap-2">
                                    <Eye size={18} style={{ color: '#8b5cf6' }} />
                                    Region Analysis
                                </h3>
                                <div className="space-y-3">
                                    {Object.entries(videoData.region_scores).map(([region, score]) => {
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
                                                        <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                                                            style={{ background: `${barColor}18`, color: barColor }}>
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
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-4">
                            <button onClick={resetAssessment} className="btn btn-secondary flex-1">
                                <Camera size={18} />
                                New Video Assessment
                            </button>
                            <Link to="/patient" className="btn btn-primary flex-1">
                                <Activity size={18} />
                                Back to Dashboard
                            </Link>
                        </div>

                        {/* Disclaimer */}
                        <div className="p-4 rounded-lg" style={{ background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
                            <div className="flex gap-2">
                                <AlertTriangle size={18} className="text-yellow-500 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-muted">
                                    This facial analysis uses AI models and is for screening purposes only.
                                    For a comprehensive assessment, please use the full clinical triage with clinical data and voice analysis.
                                    If you experience sudden facial drooping, arm weakness, or speech difficulty — call 911 immediately.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Video Recording/Upload Section */
                    <div className="space-y-6">
                        {/* Info Card */}
                        <div className="glass-card-static p-6">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ background: 'rgba(139, 92, 246, 0.12)' }}>
                                    <Video size={24} style={{ color: '#8b5cf6' }} />
                                </div>
                                <div>
                                    <h3 className="font-semibold mb-1">How It Works</h3>
                                    <p className="text-sm text-secondary">
                                        Record a short video of your face (5-10 seconds) looking directly at the camera.
                                        Our AI will analyze your <strong>eyes</strong>, <strong>eyebrows</strong>, and <strong>mouth</strong> regions
                                        for asymmetry patterns that may indicate stroke risk.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Recording Card */}
                        <div className="glass-card-static overflow-hidden">
                            {videoFile && !isRecording ? (
                                <div className="p-8 text-center">
                                    <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                                        style={{ background: 'rgba(139, 92, 246, 0.12)' }}>
                                        <CheckCircle size={40} style={{ color: '#8b5cf6' }} />
                                    </div>
                                    <h3 className="text-xl font-semibold mb-1">{videoFile.name}</h3>
                                    <p className="text-secondary text-sm mb-6">
                                        {(videoFile.size / 1024 / 1024).toFixed(2)} MB • Ready for analysis
                                    </p>
                                    <div className="flex gap-3 justify-center">
                                        <button
                                            type="button"
                                            onClick={() => setVideoFile(null)}
                                            className="btn btn-secondary"
                                        >
                                            <VideoOff size={18} />
                                            Remove
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSubmit}
                                            disabled={loading}
                                            className="btn btn-primary btn-lg"
                                            style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)' }}
                                        >
                                            {loading ? (
                                                <>
                                                    <div className="spinner" style={{ width: '1.25rem', height: '1.25rem' }} />
                                                    Analyzing...
                                                </>
                                            ) : (
                                                <>
                                                    <Activity size={18} />
                                                    Analyze Video
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-white/10">
                                    {/* Record Option */}
                                    <div className="p-8 text-center">
                                        {isRecording ? (
                                            <div>
                                                {/* Live Camera Preview */}
                                                <div className="relative w-full max-w-[320px] mx-auto mb-4 rounded-lg overflow-hidden"
                                                    style={{ aspectRatio: '4/3', background: '#000' }}>
                                                    <video
                                                        ref={videoPreviewRef}
                                                        autoPlay
                                                        playsInline
                                                        muted
                                                        style={{
                                                            width: '100%', height: '100%',
                                                            objectFit: 'cover', transform: 'scaleX(-1)'
                                                        }}
                                                    />
                                                    <div className="absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1"
                                                        style={{ background: 'rgba(239, 68, 68, 0.85)', color: '#fff' }}>
                                                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                                        REC
                                                    </div>
                                                </div>
                                                <p className="font-bold text-2xl mb-2">
                                                    {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                                                </p>
                                                <p className="text-sm text-secondary mb-4">Recording your face...</p>
                                                <button
                                                    type="button"
                                                    onClick={stopRecording}
                                                    className="btn btn-emergency w-full flex items-center justify-center gap-2"
                                                >
                                                    <Square size={16} />
                                                    Stop Recording
                                                </button>
                                            </div>
                                        ) : (
                                            <div>
                                                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                                                    style={{ background: 'rgba(139, 92, 246, 0.15)' }}>
                                                    <Video size={40} style={{ color: '#8b5cf6' }} />
                                                </div>
                                                <h3 className="text-lg font-semibold mb-2">Record Face Video</h3>
                                                <p className="text-sm text-secondary mb-6">
                                                    Look directly at the camera for 5-10 seconds
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={startRecording}
                                                    className="btn w-full"
                                                    style={{
                                                        background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(139,92,246,0.1))',
                                                        border: '1px solid rgba(139, 92, 246, 0.4)',
                                                        color: '#a78bfa'
                                                    }}
                                                >
                                                    <Camera size={18} />
                                                    Start Camera
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Upload Option */}
                                    <div className="p-8 text-center">
                                        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                                            style={{ background: 'rgba(139, 92, 246, 0.08)' }}>
                                            <Upload size={40} style={{ color: '#7c3aed' }} />
                                        </div>
                                        <h3 className="text-lg font-semibold mb-2">Upload Video</h3>
                                        <p className="text-sm text-secondary mb-6">
                                            MP4, WEBM, OGG, AVI
                                        </p>
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

                        {/* Tips */}
                        {!videoFile && !isRecording && (
                            <div className="glass-card-static" style={{ borderLeft: '3px solid #8b5cf6' }}>
                                <h4 className="font-semibold mb-3 flex items-center gap-2">
                                    <Camera size={16} style={{ color: '#8b5cf6' }} />
                                    Tips for Best Results
                                </h4>
                                <ul className="space-y-2 text-sm text-secondary">
                                    <li className="flex items-start gap-2">
                                        <span style={{ color: '#8b5cf6' }}>•</span>
                                        Face the camera directly with good lighting
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span style={{ color: '#8b5cf6' }}>•</span>
                                        Keep a neutral expression, eyes open
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span style={{ color: '#8b5cf6' }}>•</span>
                                        Record for at least 5 seconds
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span style={{ color: '#8b5cf6' }}>•</span>
                                        Avoid background movement
                                    </li>
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* Disclaimer */}
                <div className="disclaimer mt-8">
                    <p className="text-sm">
                        ⚕️ This video assessment uses AI-powered facial analysis for early stroke detection screening.
                        It is not a medical diagnosis. If you are experiencing stroke symptoms,
                        <strong> call 911 immediately</strong>.
                    </p>
                </div>
            </div>
        </div>
    );
}
