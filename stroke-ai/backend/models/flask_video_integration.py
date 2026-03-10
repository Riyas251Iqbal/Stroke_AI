# ── Flask Triage Service — Video Stroke Model ─────────────────────────────
# Place the 3 .pth files + video_model_metadata.json in your models/ directory

import torch
import torch.nn as nn
import timm
import numpy as np
import json
from pathlib import Path
from PIL import Image
from torchvision import transforms

MODEL_DIR = Path('models/') # This should be where your models and metadata are stored in your Flask app

with open(MODEL_DIR / 'video_model_metadata.json') as f:
    _video_meta = json.load(f)

IMG_SIZE       = _video_meta['img_size']
REGION_WEIGHTS = _video_meta['region_weights']
SEVERITY_RISK  = _video_meta['severity_risk_map']
CLASS_NAMES    = _video_meta['severity_classes']

IMAGENET_MEAN  = _video_meta['imagenet_mean']
IMAGENET_STD   = _video_meta['imagenet_std']

_val_transform = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])

DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')


def _build_efficientnet_b3_inference(num_classes=4, pretrained=False):
    # num_classes=0 -> timm returns pooled [batch, 1536] feature vector directly
    model = timm.create_model('efficientnet_b3', pretrained=pretrained, num_classes=0)
    in_features = model.num_features  # 1536 for EfficientNet-B3

    # Classifier receives a flat [batch, 1536] tensor from timm's global_pool
    # Re-create the head exactly as it was during training
    model.head = nn.Sequential(
        nn.LayerNorm(in_features),
        nn.Dropout(p=0.4),
        nn.Linear(in_features, 512),
        nn.GELU(),
        nn.LayerNorm(512),
        nn.Dropout(p=0.3),
        nn.Linear(512, 128),
        nn.GELU(),
        nn.Dropout(p=0.2),
        nn.Linear(128, num_classes),
    )
    return model

def _load_region_model(region):
    model = _build_efficientnet_b3_inference(num_classes=4)
    weights_path = MODEL_DIR / f'video_model_{region.lower()}.pth'
    model.load_state_dict(torch.load(weights_path, map_location=DEVICE))
    model.to(DEVICE).eval()
    return model


_video_models = {r: _load_region_model(r) for r in ['Eye', 'Eyebrow', 'Mouth']}


def predict_video_stroke_risk(image_path):
    """
    Run video-based stroke risk prediction on a single frame.
    Returns: {
        risk_score   : float 0.0-1.0
        severity     : str   Mild | Moderate | Moderate Severe | Severe
        region_scores: dict  per-region risk
        region_labels: dict  per-region severity label
        confidence   : float
    }
    """
    try:
        img    = Image.open(image_path).convert('RGB')
        tensor = _val_transform(img).unsqueeze(0).to(DEVICE)
        region_risks  = {}
        region_labels = {}
        with torch.no_grad():
            for region, model in _video_models.items():
                # EfficientNet-B3 from timm provides features directly when num_classes=0
                # The custom head was attached during model definition
                feats   = model(tensor)
                probs   = torch.softmax(model.head(feats), dim=1).cpu().numpy()[0]
                cls_idx = int(np.argmax(probs))
                # Convert the class name to lowercase to match the keys in SEVERITY_RISK
                # The metadata has 'moderate severe' as a key, so lower() is sufficient.
                severity_key = CLASS_NAMES[cls_idx].lower()
                region_risks[region]  = round(float(SEVERITY_RISK.get(severity_key, 0.5)), 4)
                region_labels[region] = CLASS_NAMES[cls_idx]
        final_risk = sum(region_risks[r] * REGION_WEIGHTS[r] for r in ['Eye', 'Eyebrow', 'Mouth'])
        overall = ('Severe'          if final_risk >= 0.85 else
                   'Moderate Severe' if final_risk >= 0.65 else
                   'Moderate'        if final_risk >= 0.40 else 'Mild')
        return {
            'risk_score'   : round(float(final_risk), 4),
            'severity'     : overall,
            'region_scores': region_risks,
            'region_labels': region_labels,
            'confidence'   : round(float(max(region_risks.values())), 4),
        }
    except Exception as e:
        return {'risk_score': None, 'severity': 'error', 'error': str(e)}
