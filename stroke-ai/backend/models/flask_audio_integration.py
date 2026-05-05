
# ── Flask Triage Service — Audio Stroke Model (Ensemble) ──────
# Uses GB + RF + XGB ensemble (137 features) for dysarthria detection.
# Falls back to the old VotingClassifier if ensemble models are missing.

import numpy as np, joblib, json
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parent

# ── Load ensemble models ──────────────────────────────────────
try:
    _gb_model  = joblib.load(MODEL_DIR / 'gb_model.pkl')
    _rf_model  = joblib.load(MODEL_DIR / 'rf_model.pkl')
    _xgb_model = joblib.load(MODEL_DIR / 'xgb_model.pkl')
    _scaler    = joblib.load(MODEL_DIR / 'scaler.pkl')
    _ENSEMBLE_AVAILABLE = True
except Exception:
    _ENSEMBLE_AVAILABLE = False

# ── Legacy fallback ───────────────────────────────────────────
try:
    _audio_model   = joblib.load(MODEL_DIR / 'audio_stroke_model.pkl')
    _audio_scaler  = joblib.load(MODEL_DIR / 'audio_scaler.pkl')
    _audio_imputer = joblib.load(MODEL_DIR / 'audio_imputer.pkl')
    with open(MODEL_DIR / 'audio_feature_names.json') as f:
        _feature_names = json.load(f)
    _LEGACY_AVAILABLE = True
except Exception:
    _LEGACY_AVAILABLE = False


def predict_audio_stroke_risk(audio_file_path: str) -> dict:
    """
    Returns: {
        risk_score : float  0.0–1.0  (probability of dysarthria)
        label      : str    'control' | 'dysarthric'
        confidence : float  0.5–1.0
        model_used : str    'ensemble' | 'legacy'
    }
    """
    try:
        # ── Ensemble path (preferred) ─────────────────────────
        if _ENSEMBLE_AVAILABLE:
            import sys, os
            sys.path.insert(0, str(MODEL_DIR.parent))
            from utils.audio_features import extract_features_for_ensemble

            features = extract_features_for_ensemble(audio_file_path)
            if features is not None:
                X = features.reshape(1, -1)
                X = _scaler.transform(X)

                p_gb  = float(_gb_model.predict_proba(X)[0][1])
                p_rf  = float(_rf_model.predict_proba(X)[0][1])
                p_xgb = float(_xgb_model.predict_proba(X)[0][1])
                prob  = (p_gb + p_rf + p_xgb) / 3.0

                label      = 'dysarthric' if prob >= 0.5 else 'control'
                confidence = max(prob, 1.0 - prob)

                return {
                    'risk_score' : round(prob, 4),
                    'label'      : label,
                    'confidence' : round(confidence, 4),
                    'model_used' : 'ensemble'
                }

        # ── Legacy fallback ───────────────────────────────────
        if _LEGACY_AVAILABLE:
            from utils.audio_features import extract_features_for_model
            feats = extract_features_for_model(audio_file_path)
            if feats is None:
                return {'risk_score': None, 'label': 'unknown',
                        'confidence': 0.0, 'error': 'Feature extraction failed'}

            X = np.array([[feats.get(f, 0.0) for f in _feature_names]], dtype=np.float32)
            X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
            X = _audio_imputer.transform(X)
            X = _audio_scaler.transform(X)

            prob       = float(_audio_model.predict_proba(X)[0][1])
            label      = 'dysarthric' if prob >= 0.5 else 'control'
            confidence = max(prob, 1.0 - prob)

            return {
                'risk_score' : round(prob, 4),
                'label'      : label,
                'confidence' : round(confidence, 4),
                'model_used' : 'legacy'
            }

        return {'risk_score': None, 'label': 'error', 'confidence': 0.0,
                'error': 'No audio models available'}

    except Exception as e:
        return {'risk_score': None, 'label': 'error', 'confidence': 0.0, 'error': str(e)}
