"""
Video Feature Extraction for Early Stroke Detection
Uses EfficientNet-B3 transfer learning models to analyze facial regions
(Eye, Eyebrow, Mouth) for stroke severity classification.
"""

import torch
import torch.nn as nn
import numpy as np
import json
import os
import tempfile
from pathlib import Path
from PIL import Image
from typing import Dict, Optional

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    print("[WARN] OpenCV not installed — video file processing will not be available")

try:
    import timm
    TIMM_AVAILABLE = True
except ImportError:
    TIMM_AVAILABLE = False
    print("[WARN] timm not installed — video models will not be available")

try:
    from torchvision import transforms
    TORCHVISION_AVAILABLE = True
except ImportError:
    TORCHVISION_AVAILABLE = False
    print("[WARN] torchvision not installed — video models will not be available")


class VideoFeatureExtractor:
    """
    Extracts stroke severity predictions from facial images using
    three EfficientNet-B3 models (Eye, Eyebrow, Mouth regions).
    
    Each model classifies into 4 severity levels:
      Mild, Moderate, Moderate Severe, Severe
    
    Region weights (from training):
      Eye: 0.30, Eyebrow: 0.25, Mouth: 0.45
    """
    
    def __init__(self, models_dir: str = None):
        """
        Initialize video feature extractor.
        
        Args:
            models_dir: Path to directory containing .pth model files
                        and video_model_metadata.json
        """
        if models_dir is None:
            models_dir = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                'models'
            )
        
        self.models_dir = Path(models_dir)
        self.models_loaded = False
        self.video_models = {}
        self.metadata = None
        self.transform = None
        self.device = None
        
        self._load_models()
    
    def _load_models(self):
        """Load video model metadata and all region models."""
        if not TIMM_AVAILABLE or not TORCHVISION_AVAILABLE:
            print("[WARN] Video models unavailable — missing torch/timm/torchvision")
            return
        
        metadata_path = self.models_dir / 'video_model_metadata.json'
        if not metadata_path.exists():
            print(f"[WARN] video_model_metadata.json not found at {metadata_path}")
            return
        
        try:
            with open(metadata_path) as f:
                self.metadata = json.load(f)
            
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
            
            # Build image transform from metadata
            img_size = self.metadata['img_size']
            imagenet_mean = self.metadata['imagenet_mean']
            imagenet_std = self.metadata['imagenet_std']
            
            self.transform = transforms.Compose([
                transforms.Resize((img_size, img_size)),
                transforms.ToTensor(),
                transforms.Normalize(imagenet_mean, imagenet_std),
            ])
            
            # Load each region model
            for region in self.metadata['regions']:
                config = self.metadata['region_configs'][region]
                model_path = self.models_dir / config['model_path']
                
                if not model_path.exists():
                    print(f"[WARN] Model file not found: {model_path}")
                    continue
                
                model = self._build_model(num_classes=config['num_classes'])
                model.load_state_dict(
                    torch.load(str(model_path), map_location=self.device, weights_only=False)
                )
                model.to(self.device).eval()
                self.video_models[region] = model
                print(f"  [OK] Loaded video model: {region} ({config['model_path']})")
            
            if len(self.video_models) == len(self.metadata['regions']):
                self.models_loaded = True
                print(f"[OK] All {len(self.video_models)} video models loaded on {self.device}")
            else:
                print(f"[WARN] Only {len(self.video_models)}/{len(self.metadata['regions'])} video models loaded")
                
        except Exception as e:
            print(f"[ERROR] Failed to load video models: {e}")
            import traceback
            traceback.print_exc()
    
    def _build_model(self, num_classes: int = 4, pretrained: bool = False) -> nn.Module:
        """
        Build EfficientNet-B3 architecture matching training config.
        
        Args:
            num_classes: Number of output classes
            pretrained: Whether to use pretrained ImageNet weights
            
        Returns:
            PyTorch model
        """
        # num_classes=0 -> timm returns pooled [batch, 1536] feature vector
        model = timm.create_model('efficientnet_b3', pretrained=pretrained, num_classes=0)
        in_features = model.num_features  # 1536 for EfficientNet-B3
        
        # Rebuild the classifier head exactly as during training
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
    
    def _is_video_file(self, file_path: str) -> bool:
        """Check if the given file is a video (not an image)."""
        video_exts = {'.mp4', '.webm', '.avi', '.mov', '.mkv', '.ogg', '.flv'}
        return Path(file_path).suffix.lower() in video_exts

    def _extract_frame_from_video(self, video_path: str) -> Optional[str]:
        """
        Extract the best frame from a video file for facial analysis.
        Takes a frame from the middle of the video (best chance of clear face).
        
        Args:
            video_path: Path to the video file
            
        Returns:
            Path to the extracted frame image, or None on failure
        """
        if not CV2_AVAILABLE:
            print("[ERROR] OpenCV required for video processing but not installed")
            return None

        try:
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                print(f"[ERROR] Could not open video: {video_path}")
                return None

            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            if total_frames <= 0:
                # Try reading frame by frame for streams
                total_frames = 1

            # Take frame from the middle of the video
            mid_frame = total_frames // 2
            cap.set(cv2.CAP_PROP_POS_FRAMES, mid_frame)

            ret, frame = cap.read()
            if not ret:
                # Fallback: try first frame
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = cap.read()

            cap.release()

            if not ret or frame is None:
                print("[ERROR] Could not read any frame from video")
                return None

            # Save frame as temporary image
            temp_path = os.path.join(
                tempfile.gettempdir(),
                f"stroke_frame_{os.path.basename(video_path)}.jpg"
            )
            cv2.imwrite(temp_path, frame)
            print(f"  [OK] Extracted frame {mid_frame}/{total_frames} from video")
            return temp_path

        except Exception as e:
            print(f"[ERROR] Frame extraction failed: {e}")
            return None

    def predict(self, file_path: str) -> Dict:
        """
        Run video-based stroke risk prediction on a facial image or video file.
        
        For video files, automatically extracts the best frame for analysis.
        Analyzes Eye, Eyebrow, and Mouth regions using separate models,
        then combines scores using region-specific weights.
        
        Args:
            file_path: Path to the facial image or video file
            
        Returns:
            Dictionary with:
                risk_score: float (0.0-1.0) — weighted severity score
                severity: str — overall severity label
                region_scores: dict — per-region risk scores
                region_labels: dict — per-region severity labels
                confidence: float — prediction confidence
                error: str (only on failure)
        """
        if not self.models_loaded:
            return {
                'risk_score': None,
                'severity': 'unavailable',
                'error': 'Video models not loaded'
            }
        
        try:
            # Handle video files — extract frame first
            image_path = file_path
            temp_frame = None
            
            if self._is_video_file(file_path):
                temp_frame = self._extract_frame_from_video(file_path)
                if temp_frame is None:
                    return {
                        'risk_score': None,
                        'severity': 'error',
                        'error': 'Could not extract frame from video file'
                    }
                image_path = temp_frame

            img = Image.open(image_path).convert('RGB')
            tensor = self.transform(img).unsqueeze(0).to(self.device)
            
            severity_classes = self.metadata['severity_classes']
            severity_risk_map = self.metadata['severity_risk_map']
            region_weights = self.metadata['region_weights']
            
            region_risks = {}
            region_labels = {}
            region_confidences = {}
            
            with torch.no_grad():
                for region, model in self.video_models.items():
                    # Forward pass through the full model (backbone + custom head)
                    logits = model(tensor)
                    # Apply head if logits come from backbone only
                    if logits.shape[-1] != len(severity_classes):
                        logits = model.head(logits)
                    
                    probs = torch.softmax(logits, dim=1).cpu().numpy()[0]
                    cls_idx = int(np.argmax(probs))
                    
                    severity_key = severity_classes[cls_idx].lower()
                    region_risks[region] = round(
                        float(severity_risk_map.get(severity_key, 0.5)), 4
                    )
                    region_labels[region] = severity_classes[cls_idx]
                    region_confidences[region] = round(float(probs[cls_idx]), 4)
            
            # Weighted combination across regions
            final_risk = sum(
                region_risks[r] * region_weights[r]
                for r in self.metadata['regions']
                if r in region_risks
            )
            
            # Determine overall severity
            if final_risk >= 0.85:
                overall = 'Severe'
            elif final_risk >= 0.65:
                overall = 'Moderate Severe'
            elif final_risk >= 0.40:
                overall = 'Moderate'
            else:
                overall = 'Mild'
            
            # Average confidence across regions
            avg_confidence = np.mean(list(region_confidences.values()))
            
            return {
                'risk_score': round(float(final_risk), 4),
                'severity': overall,
                'region_scores': region_risks,
                'region_labels': region_labels,
                'region_confidences': region_confidences,
                'confidence': round(float(avg_confidence), 4),
            }
            
        except Exception as e:
            return {
                'risk_score': None,
                'severity': 'error',
                'error': str(e)
            }
        finally:
            # Cleanup temp frame file
            if temp_frame and os.path.exists(temp_frame):
                try:
                    os.remove(temp_frame)
                except:
                    pass


# Convenience function
def predict_video_stroke_risk(image_path: str, models_dir: str = None) -> Dict:
    """
    Convenience function to predict stroke risk from a facial image.
    
    Args:
        image_path: Path to the facial image
        models_dir: Optional path to models directory
        
    Returns:
        Dictionary with risk_score, severity, region details
    """
    extractor = VideoFeatureExtractor(models_dir)
    return extractor.predict(image_path)


if __name__ == "__main__":
    print("Video Feature Extractor for Early Stroke Detection CDSS")
    print("Analyzes Eye, Eyebrow, and Mouth regions using EfficientNet-B3")
