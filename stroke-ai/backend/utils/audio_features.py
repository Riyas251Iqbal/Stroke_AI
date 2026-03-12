"""
Audio Feature Extraction for Early Stroke Detection
Extracts speech-derived features including MFCC, prosody, and timing features
used for stroke risk assessment in the CDSS system.
"""

import numpy as np
import librosa
import json
from typing import Dict, Tuple, Optional
import warnings

warnings.filterwarnings('ignore')


class AudioFeatureExtractor:
    """
    Extracts clinically-relevant audio features from speech recordings
    for early stroke detection.
    
    Features extracted:
    - MFCC: Mel-Frequency Cepstral Coefficients (vocal tract characteristics)
    - Prosody: Pitch, energy, rhythm (speech melody and stress)
    - Timing: Speech rate, pause patterns (motor control indicators)
    """
    
    def __init__(self, sample_rate: int = 22050, n_mfcc: int = 13):
        """
        Initialize the audio feature extractor.
        
        Args:
            sample_rate: Target sampling rate for audio
            n_mfcc: Number of MFCC coefficients to extract
        """
        self.sample_rate = sample_rate
        self.n_mfcc = n_mfcc
    
    def load_audio(self, audio_path: str) -> Tuple[np.ndarray, int]:
        """
        Load audio file and resample to target sample rate.
        
        Args:
            audio_path: Path to audio file
        
        Returns:
            Tuple of (audio waveform, sample rate)
        """
        try:
            print(f"DEBUG: Loading audio from {audio_path}")
            audio, sr = librosa.load(audio_path, sr=self.sample_rate, mono=True)
            print(f"DEBUG: Successfully loaded audio. Shape: {audio.shape}")
            return audio, sr
        except Exception as e:
            print(f"DEBUG: librosa.load FAILED. Error: {e}")
            print(f"DEBUG: Error type: {type(e)}")
            raise ValueError(f"Error loading audio file: {str(e)}")
    
    def extract_mfcc_features(self, audio: np.ndarray) -> Dict[str, float]:
        """
        Extract MFCC features representing vocal tract characteristics.
        
        MFCCs capture the spectral envelope of speech, which can indicate
        articulatory difficulties common in stroke patients.
        
        Args:
            audio: Audio waveform
        
        Returns:
            Dictionary of MFCC statistics
        """
        # Compute MFCCs
        mfccs = librosa.feature.mfcc(
            y=audio, 
            sr=self.sample_rate, 
            n_mfcc=self.n_mfcc
        )
        
        # Statistical features across time
        mfcc_features = {
            'mfcc_mean': float(np.mean(mfccs)),
            'mfcc_std': float(np.std(mfccs)),
            'mfcc_median': float(np.median(mfccs)),
            'mfcc_max': float(np.max(mfccs)),
            'mfcc_min': float(np.min(mfccs)),
        }
        
        # Individual MFCC coefficient statistics (first 5 for model input)
        for i in range(min(5, self.n_mfcc)):
            mfcc_features[f'mfcc_{i}_mean'] = float(np.mean(mfccs[i]))
            mfcc_features[f'mfcc_{i}_std'] = float(np.std(mfccs[i]))
            
        # Add all means list for simple models
        mfcc_features['mfcc_means'] = [float(np.mean(mfccs[i])) for i in range(self.n_mfcc)]
        
        return mfcc_features
    
    def extract_prosody_features(self, audio: np.ndarray) -> Dict[str, float]:
        """
        Extract prosodic features (pitch, energy, rhythm).
        
        Prosody abnormalities can indicate neurological impairment
        affecting speech production.
        
        Args:
            audio: Audio waveform
        
        Returns:
            Dictionary of prosody features
        """
        # Pitch (fundamental frequency) extraction
        pitches, magnitudes = librosa.piptrack(
            y=audio, 
            sr=self.sample_rate,
            fmin=75,  # Typical human pitch range
            fmax=400
        )
        
        # Extract pitch values where magnitude is high
        pitch_values = []
        for t in range(pitches.shape[1]):
            index = magnitudes[:, t].argmax()
            pitch = pitches[index, t]
            if pitch > 0:
                pitch_values.append(pitch)
        
        pitch_values = np.array(pitch_values) if pitch_values else np.array([0])
        
        # Energy (RMS) extraction
        rms = librosa.feature.rms(y=audio)[0]
        
        # Zero-crossing rate (speech rhythm indicator)
        zcr = librosa.feature.zero_crossing_rate(audio)[0]
        
        # Spectral descriptors (brightness, spread, rolloff)
        spectral_centroid = librosa.feature.spectral_centroid(y=audio, sr=self.sample_rate)[0]
        spectral_bandwidth = librosa.feature.spectral_bandwidth(y=audio, sr=self.sample_rate)[0]
        spectral_rolloff = librosa.feature.spectral_rolloff(y=audio, sr=self.sample_rate)[0]
        
        prosody_features = {
            'pitch_mean': float(np.mean(pitch_values)),
            'pitch_std': float(np.std(pitch_values)),
            'pitch_range': float(np.max(pitch_values) - np.min(pitch_values)),
            'pitch_median': float(np.median(pitch_values)),
            'energy_mean': float(np.mean(rms)),
            'energy_std': float(np.std(rms)),
            'energy_max': float(np.max(rms)),
            'zcr_mean': float(np.mean(zcr)),
            'zcr_std': float(np.std(zcr)),
            'spectral_centroid_mean': float(np.mean(spectral_centroid)),
            'spectral_bandwidth_mean': float(np.mean(spectral_bandwidth)),
            'spectral_rolloff_mean': float(np.mean(spectral_rolloff)),
        }
        
        return prosody_features
    
    def extract_timing_features(self, audio: np.ndarray) -> Dict[str, float]:
        """
        Extract timing features (speech rate, pauses).
        
        Timing abnormalities can indicate motor control issues
        associated with stroke.
        
        Args:
            audio: Audio waveform
        
        Returns:
            Dictionary of timing features
        """
        # Detect speech/silence using energy threshold
        rms = librosa.feature.rms(y=audio)[0]
        threshold = np.mean(rms) * 0.3
        
        # Voice activity detection
        is_speech = rms > threshold
        
        # Calculate speech and pause durations
        speech_frames = np.sum(is_speech)
        pause_frames = len(is_speech) - speech_frames
        
        hop_length = 512
        frame_duration = hop_length / self.sample_rate
        
        total_duration = len(audio) / self.sample_rate
        speech_duration = speech_frames * frame_duration
        pause_duration = pause_frames * frame_duration
        
        # Detect pause segments
        pause_segments = []
        in_pause = False
        pause_start = 0
        
        for i, is_speaking in enumerate(is_speech):
            if not is_speaking and not in_pause:
                pause_start = i
                in_pause = True
            elif is_speaking and in_pause:
                pause_segments.append(i - pause_start)
                in_pause = False
        
        pause_segments = np.array(pause_segments) * frame_duration if pause_segments else np.array([0])
        
        # Spectral flux (speech variability)
        spectral_flux = np.sum(np.diff(np.abs(librosa.stft(audio)), axis=1)**2, axis=0)
        
        timing_features = {
            'total_duration': float(total_duration),
            'speech_duration': float(speech_duration),
            'pause_duration': float(pause_duration),
            'speech_rate': float(speech_duration / total_duration) if total_duration > 0 else 0.0,
            'pause_rate': float(pause_duration / total_duration) if total_duration > 0 else 0.0,
            'avg_pause_length': float(np.mean(pause_segments)),
            'max_pause_length': float(np.max(pause_segments)),
            'num_pauses': int(len(pause_segments)),
            'spectral_flux_mean': float(np.mean(spectral_flux)),
            'spectral_flux_std': float(np.std(spectral_flux)),
        }
        
        return timing_features
    
    def extract_all_features(self, audio_path: str) -> Dict[str, any]:
        """
        Extract all audio features from a speech recording.
        
        Args:
            audio_path: Path to audio file
        
        Returns:
            Dictionary containing all extracted features organized by type
        """
        # Load audio
        audio, sr = self.load_audio(audio_path)
        
        # Extract all feature types
        mfcc_features = self.extract_mfcc_features(audio)
        prosody_features = self.extract_prosody_features(audio)
        timing_features = self.extract_timing_features(audio)
        
        # Combine all features
        all_features = {
            'mfcc': mfcc_features,
            'prosody': prosody_features,
            'timing': timing_features,
            'metadata': {
                'sample_rate': int(sr),
                'duration': float(len(audio) / sr),
                'num_samples': int(len(audio))
            }
        }
        
        return all_features
    
    def get_feature_vector(self, audio_path: str) -> np.ndarray:
        """
        Extract features as a flat numpy array for ML model input.
        
        Args:
            audio_path: Path to audio file
        
        Returns:
            Feature vector as numpy array
        """
        features = self.extract_all_features(audio_path)
        
        # Flatten all numeric features into a vector
        feature_vector = []
        
        for category in ['mfcc', 'prosody', 'timing']:
            for key, value in features[category].items():
                if isinstance(value, (int, float)):
                    feature_vector.append(value)
        
        return np.array(feature_vector)
    
    def save_features_json(self, features: Dict, output_path: str) -> None:
        """
        Save extracted features to JSON file.
        
        Args:
            features: Feature dictionary
            output_path: Path to save JSON file
        """
        with open(output_path, 'w') as f:
            json.dump(features, f, indent=2)


def extract_features_for_model(audio_path: str,
                                sample_rate: int = 16000,
                                n_mfcc: int = 40,
                                hop_length: int = 512,
                                n_fft: int = 2048,
                                max_duration: float = 10.0) -> Optional[Dict[str, float]]:
    """
    Extract 274 features matching the new audio_stroke_model.pkl expectations.
    
    Feature breakdown:
      - 40 MFCC mean + 40 MFCC std = 80
      - 40 delta MFCC mean + 40 delta MFCC std = 80
      - 40 delta² MFCC mean + 40 delta² MFCC std = 80
      - Spectral: centroid, bandwidth, rolloff, flatness (mean+std) = 8
      - ZCR (mean+std) = 2
      - Spectral contrast (7 bands mean) = 7
      - Chroma (mean+std) = 2
      - Mel spectrogram (mean+std) = 2
      - F0: mean, std, range, voiced_fraction = 4
      - RMS (mean+std) = 2
      - Onset: rate, strength_mean, strength_std = 3
      - Duration, silence_ratio, tempo, hnr_proxy = 4
      Total = 274
    
    Args:
        audio_path: Path to the audio file
        sample_rate: Target sample rate (must match training: 16000)
        n_mfcc: Number of MFCC coefficients (must match training: 40)
        hop_length: Hop length for STFT
        n_fft: FFT window size
        max_duration: Maximum audio duration in seconds
        
    Returns:
        Dictionary mapping feature names to float values, or None on failure
    """
    try:
        # Load and preprocess audio
        y, sr = librosa.load(audio_path, sr=sample_rate, mono=True,
                             duration=max_duration)
        
        if len(y) == 0:
            return None
        
        features = {}
        
        # ── MFCCs + deltas ──────────────────────────────────────────
        mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc,
                                      hop_length=hop_length, n_fft=n_fft)
        delta_mfccs = librosa.feature.delta(mfccs)
        delta2_mfccs = librosa.feature.delta(mfccs, order=2)
        
        for i in range(n_mfcc):
            features[f'mfcc_mean_{i}'] = float(np.mean(mfccs[i]))
            features[f'mfcc_std_{i}'] = float(np.std(mfccs[i]))
        
        for i in range(n_mfcc):
            features[f'delta_mfcc_mean_{i}'] = float(np.mean(delta_mfccs[i]))
            features[f'delta_mfcc_std_{i}'] = float(np.std(delta_mfccs[i]))
        
        for i in range(n_mfcc):
            features[f'delta2_mfcc_mean_{i}'] = float(np.mean(delta2_mfccs[i]))
            features[f'delta2_mfcc_std_{i}'] = float(np.std(delta2_mfccs[i]))
        
        # ── Spectral features ──────────────────────────────────────
        spec_centroid = librosa.feature.spectral_centroid(y=y, sr=sr,
                                                          hop_length=hop_length)
        features['spec_centroid_mean'] = float(np.mean(spec_centroid))
        features['spec_centroid_std'] = float(np.std(spec_centroid))
        
        spec_bw = librosa.feature.spectral_bandwidth(y=y, sr=sr,
                                                      hop_length=hop_length)
        features['spec_bandwidth_mean'] = float(np.mean(spec_bw))
        features['spec_bandwidth_std'] = float(np.std(spec_bw))
        
        spec_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr,
                                                         hop_length=hop_length)
        features['spec_rolloff_mean'] = float(np.mean(spec_rolloff))
        features['spec_rolloff_std'] = float(np.std(spec_rolloff))
        
        spec_flat = librosa.feature.spectral_flatness(y=y, hop_length=hop_length)
        features['spec_flatness_mean'] = float(np.mean(spec_flat))
        features['spec_flatness_std'] = float(np.std(spec_flat))
        
        # ── Zero Crossing Rate ─────────────────────────────────────
        zcr = librosa.feature.zero_crossing_rate(y, hop_length=hop_length)
        features['zcr_mean'] = float(np.mean(zcr))
        features['zcr_std'] = float(np.std(zcr))
        
        # ── Spectral Contrast (7 bands) ───────────────────────────
        spec_contrast = librosa.feature.spectral_contrast(y=y, sr=sr,
                                                           hop_length=hop_length)
        for band_i in range(min(7, spec_contrast.shape[0])):
            features[f'spec_contrast_band{band_i}_mean'] = float(
                np.mean(spec_contrast[band_i])
            )
        
        # ── Chroma ─────────────────────────────────────────────────
        chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=hop_length)
        features['chroma_mean'] = float(np.mean(chroma))
        features['chroma_std'] = float(np.std(chroma))
        
        # ── Mel spectrogram ────────────────────────────────────────
        mel = librosa.feature.melspectrogram(y=y, sr=sr, hop_length=hop_length)
        features['mel_mean'] = float(np.mean(mel))
        features['mel_std'] = float(np.std(mel))
        
        # ── F0 (fundamental frequency) ─────────────────────────────
        f0, voiced_flag, _ = librosa.pyin(y, fmin=65, fmax=600,
                                           sr=sr, hop_length=hop_length)
        f0_valid = f0[~np.isnan(f0)] if f0 is not None else np.array([0.0])
        if len(f0_valid) == 0:
            f0_valid = np.array([0.0])
        
        features['f0_mean'] = float(np.mean(f0_valid))
        features['f0_std'] = float(np.std(f0_valid))
        features['f0_range'] = float(np.ptp(f0_valid))
        features['voiced_fraction'] = float(
            np.sum(voiced_flag) / len(voiced_flag)
        ) if voiced_flag is not None and len(voiced_flag) > 0 else 0.0
        
        # ── RMS energy ─────────────────────────────────────────────
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        features['rms_mean'] = float(np.mean(rms))
        features['rms_std'] = float(np.std(rms))
        
        # ── Onset features ─────────────────────────────────────────
        onset_env = librosa.onset.onset_strength(y=y, sr=sr,
                                                  hop_length=hop_length)
        onsets = librosa.onset.onset_detect(y=y, sr=sr,
                                             hop_length=hop_length)
        duration_sec = float(len(y) / sr)
        
        features['onset_rate'] = float(
            len(onsets) / duration_sec
        ) if duration_sec > 0 else 0.0
        features['onset_strength_mean'] = float(np.mean(onset_env))
        features['onset_strength_std'] = float(np.std(onset_env))
        
        # ── Timing / global features ──────────────────────────────
        features['duration_sec'] = duration_sec
        
        # Silence ratio
        rms_threshold = np.mean(rms) * 0.3
        silence_frames = np.sum(rms < rms_threshold)
        features['silence_ratio'] = float(
            silence_frames / len(rms)
        ) if len(rms) > 0 else 0.0
        
        # Tempo
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop_length)
        features['tempo'] = float(tempo) if np.isscalar(tempo) else float(tempo[0])
        
        # HNR proxy (harmonic-to-noise ratio approximation)
        harmonic = librosa.effects.harmonic(y)
        noise = y - harmonic
        h_energy = float(np.sum(harmonic ** 2))
        n_energy = float(np.sum(noise ** 2))
        features['hnr_proxy'] = float(
            10 * np.log10(h_energy / n_energy)
        ) if n_energy > 1e-10 else 40.0
        
        # Replace any NaN/Inf
        for k in features:
            v = features[k]
            if not np.isfinite(v):
                features[k] = 0.0
        
        return features
        
    except Exception as e:
        print(f"[ERROR] Audio feature extraction failed: {e}")
        import traceback
        traceback.print_exc()
        return None


# Utility function for easy feature extraction
def extract_speech_features(audio_path: str) -> Dict[str, any]:
    """
    Convenience function to extract all speech features.
    
    Args:
        audio_path: Path to audio file
    
    Returns:
        Dictionary of extracted features
    """
    extractor = AudioFeatureExtractor()
    return extractor.extract_all_features(audio_path)


if __name__ == "__main__":
    # Example usage
    print("Audio Feature Extractor for Early Stroke Detection CDSS")
    print("Extracts MFCC, prosody, and timing features from speech recordings")