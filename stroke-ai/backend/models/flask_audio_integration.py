
# ── Flask Triage Service — Audio Stroke Model ─────────────────
# 1. Copy extract_features() from this notebook into your service
# 2. Place the 4 .pkl/.json files in your models/ directory
# 3. Use this loader + predict function

import numpy as np, joblib, json
from pathlib import Path

MODEL_DIR = Path('models/')

_audio_model   = joblib.load(MODEL_DIR / 'audio_stroke_model.pkl')
_audio_scaler  = joblib.load(MODEL_DIR / 'audio_scaler.pkl')
_audio_imputer = joblib.load(MODEL_DIR / 'audio_imputer.pkl')
with open(MODEL_DIR / 'audio_feature_names.json') as f:
    _feature_names = json.load(f)


def predict_audio_stroke_risk(audio_file_path: str) -> dict:
    """
    Returns: {
        risk_score : float  0.0–1.0  (probability of dysarthria)
        label      : str    'control' | 'dysarthric'
        confidence : float  0.5–1.0
    }
    """
    try:
        feats = extract_features(audio_file_path)   # from notebook
        if feats is None:
            return {'risk_score': None, 'label': 'unknown',
                    'confidence': 0.0, 'error': 'Feature extraction failed'}

        X = np.array([[feats.get(f, 0.0) for f in _feature_names]], dtype=np.float32)
        X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
        X = _audio_imputer.transform(X)
        X = _audio_scaler.transform(X)

        prob       = float(_audio_model.predict_proba(X)[0][1])  # P(dysarthric)
        label      = 'dysarthric' if prob >= 0.5 else 'control'
        confidence = max(prob, 1.0 - prob)

        return {
            'risk_score' : round(prob, 4),
            'label'      : label,
            'confidence' : round(confidence, 4)
        }
    except Exception as e:
        return {'risk_score': None, 'label': 'error', 'confidence': 0.0, 'error': str(e)}
