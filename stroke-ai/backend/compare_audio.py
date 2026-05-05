import sys, os
sys.path.insert(0, '.')
os.chdir(r'e:\Main_Project\stroke-ai\stroke-ai\backend')

import onnxruntime as ort
import numpy as np
import joblib
from utils.audio_features import load_audio_keras, extract_2d_features, extract_1d_features

scaler = joblib.load('models/new_audio_scaler.pkl')
s1 = ort.InferenceSession('models/model1_stroke_detector.onnx')
s2 = ort.InferenceSession('models/model2_normal_classifier.onnx')

files = {
    'NORMAL': r'E:\Main_Project\stroke-ai\stroke-ai\backend\audio\uploads\patient_19_20260326_225524.wav',
    'SLURRED':  r'E:\Main_Project\stroke-ai\stroke-ai\backend\audio\uploads\patient_19_20260326_213954.wav',
}

def run_onnx(session, x2d, x1d):
    inputs = {}
    for inp in session.get_inputs():
        if len(inp.shape) == 4:
            inputs[inp.name] = x2d
        else:
            inputs[inp.name] = x1d
    output_name = session.get_outputs()[0].name
    res = session.run([output_name], inputs)
    return float(res[0][0][0])

for label, path in files.items():
    y = load_audio_keras(path)
    if y is None:
        print(f"Failed to load {label}")
        continue
    x2d = np.expand_dims(extract_2d_features(y), 0).astype(np.float32)
    x1d = np.expand_dims(extract_1d_features(y), 0).astype(np.float32)
    x1d_scaled = scaler.transform(x1d).astype(np.float32)
    x1d_scaled = np.nan_to_num(x1d_scaled, nan=0.0, posinf=0.0, neginf=0.0)
    
    stroke = run_onnx(s1, x2d, x1d_scaled)
    normal = run_onnx(s2, x2d, x1d_scaled)
    
    ensemble = stroke * 0.65 + (1.0 - normal) * 0.35
    
    print(f"[{label}] stroke_prob={stroke:.4f}, normal_prob={normal:.4f}  => ensemble_risk={ensemble:.4f}")
