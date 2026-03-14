"""
Early Stroke Risk Scoring Engine
Evaluates clinical, audio, and video features to compute stroke risk scores
for the Clinical Decision Support System (CDSS).

Supports the tri-model architecture:
  - Clinical Model: Logistic Regression (18 features)
  - Audio Model: VotingClassifier (274 features) — dysarthria detection
  - Video Model: EfficientNet-B3 (Eye/Eyebrow/Mouth) — facial asymmetry
  - Ensemble: Weighted combination (50% clinical + 25% audio + 25% video)
"""

import numpy as np
import joblib
import os
import json
from typing import Dict, Tuple, List, Optional


class StrokeRiskScorer:
    """
    Computes early stroke risk scores using pre-trained ML models.
    Combines clinical tabular data with speech-derived audio features.
    """
    
    def __init__(self, models_dir: str = None):
        """
        Initialize the risk scoring engine.
        
        Args:
            models_dir: Path to directory containing model files
        """
        if models_dir is None:
            models_dir = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                'models'
            )
        
        self.models_dir = models_dir
        self.clinical_model = None
        self.clinical_scaler = None
        self.metadata = None
        
        # Old audio model (kept for backward compat)
        self.audio_model = None
        self.audio_scaler = None
        self.feature_names = None
        
        # New audio stroke model (VotingClassifier, 274 features)
        self.new_audio_model = None
        self.new_audio_scaler = None
        self.new_audio_imputer = None
        self.new_audio_feature_names = None
        
        # Tri-model ensemble weights
        # When all 3 available: 50% clinical + 25% audio + 25% video
        # When clinical + audio only: 60% clinical + 40% audio
        # When clinical + video only: 60% clinical + 40% video
        self.clinical_weight = 0.6
        self.audio_weight = 0.4
        self.video_weight = 0.0  # Set dynamically when video data is present
        
        # Triage thresholds (defaults, overridden by metadata)
        self.thresholds = {
            'low': 0.30,
            'moderate': 0.60,
            'high': 0.85
        }
        
        self._load_models()
    
    def _load_models(self):
        """Load all model components from the models directory."""
        # Legacy models
        files = {
            'clinical_model': 'clinical_model.pkl',
            'audio_model': 'audio_model.pkl',
            'clinical_scaler': 'clinical_scaler.pkl',
            'audio_scaler': 'audio_scaler.pkl',
            'feature_names': 'feature_names.pkl',
            'metadata': 'model_metadata.json'
        }
        
        for attr, filename in files.items():
            path = os.path.join(self.models_dir, filename)
            if not os.path.exists(path):
                print(f"  Warning: {filename} not found")
                continue
            
            try:
                if filename.endswith('.json'):
                    with open(path, 'r') as f:
                        setattr(self, attr, json.load(f))
                else:
                    setattr(self, attr, joblib.load(path))
            except Exception as e:
                print(f"  Error loading {filename}: {e}")
        
        # New audio stroke model (VotingClassifier, 274 features)
        new_audio_files = {
            'new_audio_model': 'audio_stroke_model.pkl',
            'new_audio_scaler': 'audio_scaler.pkl',
            'new_audio_imputer': 'audio_imputer.pkl',
        }
        
        for attr, filename in new_audio_files.items():
            path = os.path.join(self.models_dir, filename)
            if not os.path.exists(path):
                print(f"  Warning: {filename} not found")
                continue
            try:
                setattr(self, attr, joblib.load(path))
            except Exception as e:
                print(f"  Error loading {filename}: {e}")
        
        # Load new audio feature names
        feat_names_path = os.path.join(self.models_dir, 'audio_feature_names.json')
        if os.path.exists(feat_names_path):
            try:
                with open(feat_names_path, 'r') as f:
                    self.new_audio_feature_names = json.load(f)
            except Exception as e:
                print(f"  Error loading audio_feature_names.json: {e}")
        
        # Apply metadata configuration
        if self.metadata:
            config = self.metadata.get('ensemble_config', {})
            self.clinical_weight = config.get('clinical_weight', 0.6)
            self.audio_weight = config.get('audio_weight', 0.4)
        
        # Report status
        status = []
        if self.clinical_model: status.append('Clinical')
        if self.audio_model: status.append('Audio(legacy)')
        if self.new_audio_model: status.append('Audio(new-274f)')
        if self.clinical_scaler: status.append('ClinicalScaler')
        if self.new_audio_scaler: status.append('AudioScaler(new)')
        if self.new_audio_imputer: status.append('AudioImputer')
        print(f"[OK] Models loaded successfully from {self.models_dir}")
        print(f"     Components: {', '.join(status)}")
    
    # ──────────────────────────────────────────────
    # Feature Engineering
    # ──────────────────────────────────────────────
    
    def _engineer_clinical_features(self, clinical_data: Dict) -> np.ndarray:
        """
        Engineer the 18 clinical features expected by the model.
        
        Feature order (must match training):
        gender, age, hypertension, heart_disease, ever_married,
        Residence_type, avg_glucose_level, bmi, smoking_status,
        work_Govt_job, work_Never_worked, work_Private, work_Self-employed,
        work_children, bmi_category, glucose_category, age_risk, risk_factors
        """
        # --- Base features ---
        gender = self._encode_gender(clinical_data.get('gender', 'Male'))
        age = float(clinical_data.get('age', 50))
        hypertension = int(clinical_data.get('hypertension', 0))
        heart_disease = int(clinical_data.get('heart_disease', 0))
        ever_married = self._encode_binary(clinical_data.get('ever_married', 'Yes'))
        residence_type = self._encode_binary(
            clinical_data.get('Residence_type', clinical_data.get('residence_type', 'Urban')),
            positive='Urban'
        )
        avg_glucose = float(clinical_data.get('avg_glucose_level', 100.0))
        bmi = float(clinical_data.get('bmi', 25.0))
        smoking_status = self._encode_smoking(clinical_data.get('smoking_status', 'never smoked'))
        
        # --- One-hot encode work_type ---
        work_type = clinical_data.get('work_type', 'Private')
        work_categories = ['Govt_job', 'Never_worked', 'Private', 'Self-employed', 'children']
        work_encoded = [1 if work_type == cat else 0 for cat in work_categories]
        
        # --- Engineered features ---
        bmi_category = self._categorize_bmi(bmi)
        glucose_category = self._categorize_glucose(avg_glucose)
        age_risk = 1 if age >= 55 else 0
        
        # Diabetes from clinical data (check both fields)
        diabetes = int(clinical_data.get('diabetes', 0))
        smoking_risk = 1 if smoking_status >= 2 else 0  # formerly/currently smokes
        risk_factors = hypertension + heart_disease + diabetes + smoking_risk + age_risk
        
        # --- Assemble vector ---
        features = [
            gender, age, hypertension, heart_disease, ever_married,
            residence_type, avg_glucose, bmi, smoking_status,
            *work_encoded,
            bmi_category, glucose_category, age_risk, risk_factors
        ]
        
        return np.array(features, dtype=float).reshape(1, -1)
    
    def _encode_gender(self, value) -> int:
        """Encode gender: Male=1, Female=0."""
        if isinstance(value, str):
            return 1 if value.lower() in ['male', 'm', '1'] else 0
        return int(value)
    
    def _encode_binary(self, value, positive='Yes') -> int:
        """Encode Yes/No or Urban/Rural as 1/0."""
        if isinstance(value, str):
            return 1 if value.lower() == positive.lower() else 0
        return int(value)
    
    def _encode_smoking(self, value) -> int:
        """Encode smoking status: never=0, unknown=1, formerly=2, smokes=3."""
        if isinstance(value, (int, float)):
            return int(value)
        mapping = {
            'never smoked': 0, 'never': 0,
            'unknown': 1,
            'formerly smoked': 2, 'former': 2,
            'smokes': 3, 'current': 3, 'currently smokes': 3
        }
        return mapping.get(str(value).lower(), 0)
    
    def _categorize_bmi(self, bmi: float) -> int:
        """Categorize BMI: 0=underweight, 1=normal, 2=overweight, 3=obese."""
        if bmi < 18.5:
            return 0
        elif bmi < 25:
            return 1
        elif bmi < 30:
            return 2
        else:
            return 3
    
    def _categorize_glucose(self, glucose: float) -> int:
        """Categorize glucose: 0=normal, 1=prediabetes, 2=diabetes."""
        if glucose < 100:
            return 0
        elif glucose < 126:
            return 1
        else:
            return 2
    
    def prepare_audio_features(self, audio_features: Optional[Dict]) -> Optional[np.ndarray]:
        """
        Prepare audio features as a flat 37-element vector for the legacy audio model.
        
        Feature order matches get_feature_vector() from AudioFeatureExtractor:
        MFCC (15) + Prosody (12) + Timing (10) = 37
        """
        if not audio_features:
            return None
        
        feature_vector = []
        
        for category in ['mfcc', 'prosody', 'timing']:
            cat_data = audio_features.get(category, {})
            for key, value in cat_data.items():
                if isinstance(value, (int, float)):
                    feature_vector.append(float(value))
        
        if len(feature_vector) != 37:
            print(f"  Warning: Audio feature count {len(feature_vector)} != 37, padding/truncating")
            feature_vector = (feature_vector + [0.0] * 37)[:37]
        
        return np.array(feature_vector, dtype=float).reshape(1, -1)
    
    def predict_new_audio_risk(self, audio_model_features: Optional[Dict]) -> Optional[float]:
        """
        Predict dysarthria risk using the new 274-feature audio stroke model.
        
        Args:
            audio_model_features: Dict of 274 features from extract_features_for_model()
            
        Returns:
            Probability of dysarthria (0.0 - 1.0), or None if unavailable
        """
        if not audio_model_features or not self.new_audio_model:
            return None
        
        if not self.new_audio_feature_names:
            print("  Warning: audio_feature_names.json not loaded")
            return None
        
        try:
            # Build feature vector in the exact order the model expects
            X = np.array([
                [audio_model_features.get(f, 0.0) for f in self.new_audio_feature_names]
            ], dtype=np.float32)
            
            X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
            
            if self.new_audio_imputer:
                X = self.new_audio_imputer.transform(X)
            if self.new_audio_scaler:
                X = self.new_audio_scaler.transform(X)
            
            prob = float(self.new_audio_model.predict_proba(X)[0][1])  # P(dysarthric)
            return prob
            
        except Exception as e:
            print(f"  Error in new audio model prediction: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    # ──────────────────────────────────────────────
    # Risk Computation
    # ──────────────────────────────────────────────
    
    def compute_risk_score(self, clinical_data: Dict, 
                          audio_features: Optional[Dict] = None,
                          audio_model_features: Optional[Dict] = None,
                          video_risk_data: Optional[Dict] = None) -> Tuple[float, float, str, bool]:
        """
        Compute early stroke risk score combining clinical, audio, and video models.
        
        Args:
            clinical_data: Clinical variables dict
            audio_features: Legacy audio features (mfcc/prosody/timing dicts) for rule-based safety net
            audio_model_features: New 274-feature dict from extract_features_for_model()
            video_risk_data: Video prediction results from VideoFeatureExtractor.predict()
        
        Returns:
            Tuple of (risk_score, confidence, assessment_type, safety_net_triggered)
        """
        try:
            print("\n" + "="*60)
            print("DIAGNOSTIC: Risk Scoring Engine (Tri-Model)")
            print("="*60)
            
            # 1. Clinical Risk (Hybrid: ML model + rule-based safety floor)
            clinical_vec = self._engineer_clinical_features(clinical_data)
            model_clinical_risk = 0.0
            
            print(f"Clinical Features ({clinical_vec.shape[1]}): {clinical_vec[0][:5]}...")
            
            if self.clinical_model and self.clinical_scaler:
                scaled_clinical = self.clinical_scaler.transform(clinical_vec)
                probs = self.clinical_model.predict_proba(scaled_clinical)
                model_clinical_risk = float(probs[0][1])
                print(f"Clinical Model Prediction: {model_clinical_risk:.4f}")
            elif self.clinical_model:
                probs = self.clinical_model.predict_proba(clinical_vec)
                model_clinical_risk = float(probs[0][1])
                print(f"Clinical Model (unscaled): {model_clinical_risk:.4f}")
            
            rule_clinical_risk = self._calculate_rule_based_risk(clinical_data, None)
            print(f"Rule-Based Clinical Risk: {rule_clinical_risk:.4f}")
            
            if model_clinical_risk > 0:
                clinical_risk = max(
                    0.6 * model_clinical_risk + 0.4 * rule_clinical_risk,
                    rule_clinical_risk
                )
                print(f"Hybrid Clinical Risk: {clinical_risk:.4f} "
                      f"(model={model_clinical_risk:.4f}, rules={rule_clinical_risk:.4f})")
            else:
                clinical_risk = rule_clinical_risk
                print(f"Clinical Risk (rules only): {clinical_risk:.4f}")
            
            # 2. Audio Risk
            audio_risk = 0.0
            has_audio = False
            safety_net_triggered = False
            rule_audio_risk = 0.0
            model_audio_risk = 0.0
            
            if audio_features or audio_model_features:
                has_audio = True
                print("\n--- Audio Analysis ---")
                
                # Try new audio model first (274-feature VotingClassifier)
                new_audio_risk = self.predict_new_audio_risk(audio_model_features)
                if new_audio_risk is not None:
                    print(f"New Audio Model (274f) Prediction: {new_audio_risk:.4f}")
                    model_audio_risk = new_audio_risk
                else:
                    # Fall back to legacy audio model (37 features)
                    audio_vec = self.prepare_audio_features(audio_features)
                    if audio_vec is not None and self.audio_model:
                        if self.audio_scaler:
                            scaled_audio = self.audio_scaler.transform(audio_vec)
                        else:
                            scaled_audio = audio_vec
                        probs = self.audio_model.predict_proba(scaled_audio)
                        model_audio_risk = float(probs[0][1]) if probs.shape[1] > 1 else 0.0
                        print(f"Legacy Audio Model Prediction: {model_audio_risk:.4f}")
                    else:
                        model_audio_risk = 0.0
                        print("Audio models not available, using rules only")
                
                # Rule-based safety net (uses legacy features)
                if audio_features:
                    rule_audio_risk = self._calculate_audio_rule_risk(audio_features)
                    print(f"Rule-Based Audio Risk: {rule_audio_risk:.4f}")
                
                audio_risk = max(model_audio_risk, rule_audio_risk)
                
                if rule_audio_risk > model_audio_risk + 0.2:
                    safety_net_triggered = True
                    print(f"(!) SAFETY NET: Rules ({rule_audio_risk:.4f}) > Model ({model_audio_risk:.4f})")
                
                print(f"Final Audio Risk: {audio_risk:.4f}")
            else:
                print("\n  No audio features - skipping audio analysis")
            
            # 3. Video Risk
            video_risk = 0.0
            has_video = False
            
            if video_risk_data and video_risk_data.get('risk_score') is not None:
                has_video = True
                video_risk = float(video_risk_data['risk_score'])
                print(f"\n--- Video Analysis ---")
                print(f"Video Risk Score: {video_risk:.4f}")
                print(f"Video Severity: {video_risk_data.get('severity', 'N/A')}")
                print(f"Region Scores: {video_risk_data.get('region_scores', {})}")
                print(f"Region Labels: {video_risk_data.get('region_labels', {})}")
            else:
                print("\n  No video data - skipping video analysis")
            
            # 4. Determine assessment type
            if has_audio and has_video:
                assessment_type = 'full'
            elif has_audio:
                assessment_type = 'clinical_audio'
            elif has_video:
                assessment_type = 'clinical_video'
            else:
                assessment_type = 'clinical_only'
            
            # 5. Ensemble — dynamic weighting based on available modalities
            print(f"\n--- Ensemble ({assessment_type}) ---")
            
            if has_audio and has_video:
                # Tri-model: 50% clinical + 25% audio + 25% video
                c_w, a_w, v_w = 0.50, 0.25, 0.25
                final_risk = c_w * clinical_risk + a_w * audio_risk + v_w * video_risk
                confidence = 0.90
                print(f"Tri-Model: ({c_w}*{clinical_risk:.4f}) + ({a_w}*{audio_risk:.4f}) + ({v_w}*{video_risk:.4f}) = {final_risk:.4f}")
            elif has_audio:
                c_w, a_w = 0.60, 0.40
                final_risk = c_w * clinical_risk + a_w * audio_risk
                confidence = 0.85
                print(f"Dual (C+A): ({c_w}*{clinical_risk:.4f}) + ({a_w}*{audio_risk:.4f}) = {final_risk:.4f}")
            elif has_video:
                c_w, v_w = 0.60, 0.40
                final_risk = c_w * clinical_risk + v_w * video_risk
                confidence = 0.85
                print(f"Dual (C+V): ({c_w}*{clinical_risk:.4f}) + ({v_w}*{video_risk:.4f}) = {final_risk:.4f}")
            else:
                final_risk = clinical_risk
                confidence = 0.65
                print(f"Clinical only: {final_risk:.4f}")
            
            # Confidence adjustments
            imputed_fields = clinical_data.get('imputed_fields', [])
            if imputed_fields:
                penalty = 0.05 * len(imputed_fields)
                confidence = max(0.5, confidence - penalty)
            
            # Safety net override for critical audio signs (rule-based)
            if has_audio and rule_audio_risk >= 0.8:
                if final_risk < 0.85:
                    print(f"(!) CRITICAL AUDIO OVERRIDE (rules): {final_risk:.4f} -> 0.85")
                    final_risk = 0.85
                    safety_net_triggered = True
            elif has_audio and rule_audio_risk >= 0.65:
                if final_risk < 0.60:
                    print(f"(!) SAFETY AUDIO OVERRIDE (rules): {final_risk:.4f} -> 0.60")
                    final_risk = 0.60
                    safety_net_triggered = True
            
            # Safety net override for ML model dysarthria detection
            # The VotingClassifier (98% accuracy) predicts P(dysarthric);
            # if it's high, slurred speech must escalate regardless of clinical risk.
            if has_audio and model_audio_risk >= 0.80:
                if final_risk < 0.85:
                    print(f"(!) CRITICAL AUDIO OVERRIDE (ML model): {final_risk:.4f} -> 0.85 (P(dysarthric)={model_audio_risk:.4f})")
                    final_risk = 0.85
                    safety_net_triggered = True
            elif has_audio and model_audio_risk >= 0.60:
                if final_risk < 0.60:
                    print(f"(!) SAFETY AUDIO OVERRIDE (ML model): {final_risk:.4f} -> 0.60 (P(dysarthric)={model_audio_risk:.4f})")
                    final_risk = 0.60
                    safety_net_triggered = True
            
            # Video safety net — severe facial asymmetry override
            if has_video and video_risk >= 0.85:
                if final_risk < 0.80:
                    print(f"(!) VIDEO SEVERITY OVERRIDE: {final_risk:.4f} -> 0.80")
                    final_risk = 0.80
                    safety_net_triggered = True
            
            print(f"Final Confidence Score: {confidence:.2f}")
            print(f"Safety Net Triggered: {safety_net_triggered}")
            print("=" * 60 + "\n")
            
            return final_risk, confidence, assessment_type, safety_net_triggered
            
        except Exception as e:
            print(f"Risk calculation error: {str(e)}")
            import traceback
            traceback.print_exc()
            return self._calculate_rule_based_risk(clinical_data, audio_features), 0.6, 'fallback', False
    
    # ──────────────────────────────────────────────
    # Rule-Based Fallbacks
    # ──────────────────────────────────────────────
    
    def _calculate_audio_rule_risk(self, audio_features: Dict) -> float:
        """
        Calculate rule-based risk from audio features (safety net).
        """
        risk_score = 0.0
        timing = audio_features.get('timing', {})
        prosody = audio_features.get('prosody', {})
        
        # 1. Speech rate analysis
        # speech_rate = speech_duration / total_duration (0-1 ratio)
        # Normal speech is typically 0.50-0.70 due to natural pauses/breathing
        speech_rate = timing.get('speech_rate', 0.7)
        if speech_rate < 0.35:
            risk_score += 0.9   # Critical slurring (barely speaking)
        elif speech_rate < 0.45:
            risk_score += 0.5   # Moderate slurring (notably slow)

        # 2. Excessive pausing
        pause_rate = timing.get('pause_rate', 0.3)
        if pause_rate > 0.80:
            risk_score += 0.3
        elif pause_rate > 0.70:
            risk_score += 0.15
        
        # 3. Pitch variability (monotone = concern)
        pitch_std = prosody.get('pitch_std', 50)
        if pitch_std < 10:
            risk_score += 0.2   # True monotone
        elif pitch_std < 15:
            risk_score += 0.1   # Reduced variability
        
        return min(risk_score, 1.0)
    
    def _calculate_rule_based_risk(self, clinical_data: Dict, 
                                   audio_features: Optional[Dict]) -> float:
        """
        Rule-based fallback when models are unavailable.
        """
        risk_score = 0.0
        
        # Clinical factors
        age = float(clinical_data.get('age', 50))
        if age >= 65: risk_score += 0.15
        elif age >= 55: risk_score += 0.10
        elif age >= 45: risk_score += 0.05
        
        if int(clinical_data.get('hypertension', 0)): risk_score += 0.12
        if int(clinical_data.get('heart_disease', 0)): risk_score += 0.10
        if int(clinical_data.get('diabetes', 0)): risk_score += 0.08
        
        glucose = float(clinical_data.get('avg_glucose_level', 100))
        if glucose > 200: risk_score += 0.10
        elif glucose > 150: risk_score += 0.05
        
        bmi = float(clinical_data.get('bmi', 25))
        if bmi > 35: risk_score += 0.06
        elif bmi > 30: risk_score += 0.03
        
        smoking = str(clinical_data.get('smoking_status', 'never')).lower()
        if smoking in ['smokes', 'current', 'currently smokes']: risk_score += 0.08
        elif smoking in ['formerly smoked', 'former']: risk_score += 0.04
        
        # Audio factors
        if audio_features:
            timing = audio_features.get('timing', {})
            prosody = audio_features.get('prosody', {})
            
            speech_rate = timing.get('speech_rate', 0.7)
            if speech_rate < 0.35:
                risk_score += 0.08
            elif speech_rate < 0.45:
                risk_score += 0.05
            
            pause_rate = timing.get('pause_rate', 0.3)
            if pause_rate > 0.70:
                risk_score += 0.06
            
            if prosody.get('pitch_std', 50) < 15:
                risk_score += 0.05
        
        return min(risk_score, 1.0)
    
    # ──────────────────────────────────────────────
    # Clinical Insights
    # ──────────────────────────────────────────────
    
    def get_feature_importance(self, clinical_data: Dict, 
                              audio_features: Optional[Dict]) -> Dict[str, float]:
        """Calculate feature importance/contribution to risk score."""
        importance = {}
        
        # Clinical factors
        age = float(clinical_data.get('age', 50))
        if age >= 65: importance['Advanced Age (>65)'] = 0.15
        elif age >= 55: importance['Elevated Age (55-64)'] = 0.10
        
        if int(clinical_data.get('hypertension', 0)):
            importance['Hypertension'] = 0.12
        if int(clinical_data.get('heart_disease', 0)):
            importance['Heart Disease'] = 0.10
        if int(clinical_data.get('diabetes', 0)):
            importance['Diabetes'] = 0.08
        
        glucose = float(clinical_data.get('avg_glucose_level', 100))
        if glucose > 200: importance['Severely Elevated Glucose'] = 0.10
        elif glucose > 150: importance['Elevated Glucose'] = 0.05
        
        bmi = float(clinical_data.get('bmi', 25))
        if bmi > 35: importance['Severe Obesity'] = 0.06
        elif bmi > 30: importance['Obesity'] = 0.03
        
        smoking = str(clinical_data.get('smoking_status', 'never')).lower()
        if smoking in ['smokes', 'current', 'currently smokes']:
            importance['Current Smoker'] = 0.08
        elif smoking in ['formerly smoked', 'former']:
            importance['Former Smoker'] = 0.04
        
        # Audio factors
        if audio_features:
            timing = audio_features.get('timing', {})
            prosody = audio_features.get('prosody', {})
            
            if timing.get('pause_rate', 0) > 0.70:
                importance['Speech Timing Abnormality'] = 0.09
            if timing.get('speech_rate', 0.7) < 0.35:
                importance['Reduced Speech Rate'] = 0.08
            elif timing.get('speech_rate', 0.7) < 0.45:
                importance['Mildly Reduced Speech Rate'] = 0.05
            if prosody.get('pitch_std', 0) < 15:
                importance['Reduced Pitch Variability'] = 0.07
        
        return dict(sorted(importance.items(), key=lambda x: x[1], reverse=True))
    
    def get_video_importance(self, video_risk_data: Optional[Dict]) -> Dict[str, float]:
        """Calculate feature importance from video analysis results."""
        importance = {}
        if not video_risk_data or video_risk_data.get('risk_score') is None:
            return importance
        
        region_scores = video_risk_data.get('region_scores', {})
        region_labels = video_risk_data.get('region_labels', {})
        
        for region, score in region_scores.items():
            label = region_labels.get(region, 'Unknown')
            if score >= 0.75:
                importance[f'{region} Asymmetry ({label})'] = score * 0.15
            elif score >= 0.50:
                importance[f'{region} Asymmetry ({label})'] = score * 0.10
        
        return importance
    
    def get_clinical_flags(self, clinical_data: Dict, 
                          audio_features: Optional[Dict]) -> List[str]:
        """Identify concerning clinical indicators."""
        flags = []
        
        age = float(clinical_data.get('age', 50))
        if age >= 65: flags.append("Advanced age (>65 years)")
        elif age >= 55: flags.append("Elevated age (55-64 years)")
        
        if int(clinical_data.get('hypertension', 0)):
            flags.append("History of hypertension")
        if int(clinical_data.get('heart_disease', 0)):
            flags.append("History of heart disease")
        if int(clinical_data.get('diabetes', 0)):
            flags.append("History of diabetes")
        
        glucose = float(clinical_data.get('avg_glucose_level', 100))
        if glucose > 200: flags.append("Severely elevated glucose (>200 mg/dL)")
        elif glucose > 150: flags.append("Elevated glucose level")
        
        bmi = float(clinical_data.get('bmi', 25))
        if bmi > 35: flags.append("Severe obesity (BMI >35)")
        elif bmi > 30: flags.append("Obesity (BMI >30)")
        
        smoking = str(clinical_data.get('smoking_status', 'never')).lower()
        if smoking in ['smokes', 'current', 'currently smokes']:
            flags.append("Current smoker")
        
        # Audio flags
        if audio_features:
            timing = audio_features.get('timing', {})
            prosody = audio_features.get('prosody', {})
            
            if timing.get('speech_rate', 0.7) < 0.35:
                flags.append("Critical reduction in speech rate (Slurred)")
            elif timing.get('speech_rate', 0.7) < 0.45:
                flags.append("Reduced speech rate (Possible Slurring)")
            
            if timing.get('pause_rate', 0.3) > 0.80:
                flags.append("Excessive speech pauses")
            elif timing.get('pause_rate', 0.3) > 0.70:
                flags.append("Elevated speech pause rate")
            
            if prosody.get('pitch_std', 50) < 15:
                flags.append("Reduced speech prosody variability")
        
        return flags
    
    def get_video_flags(self, video_risk_data: Optional[Dict]) -> list:
        """Identify concerning video-based indicators."""
        flags = []
        if not video_risk_data or video_risk_data.get('risk_score') is None:
            return flags
        
        severity = video_risk_data.get('severity', '')
        region_labels = video_risk_data.get('region_labels', {})
        region_scores = video_risk_data.get('region_scores', {})
        
        if severity in ('Severe', 'Moderate Severe'):
            flags.append(f"Facial asymmetry detected: {severity}")
        
        for region, label in region_labels.items():
            score = region_scores.get(region, 0)
            if label in ('Severe', 'Moderate Severe'):
                flags.append(f"{region} region: {label} asymmetry (risk={score:.2f})")
        
        return flags


# Convenience function
def calculate_stroke_risk(clinical_data: Dict, 
                         audio_features: Optional[Dict] = None) -> Dict:
    """
    Calculate stroke risk with all relevant information.
    
    Args:
        clinical_data: Clinical variables
        audio_features: Audio features (optional)
    
    Returns:
        Dictionary with risk_score, confidence, feature_importance, and flags
    """
    scorer = StrokeRiskScorer()
    risk_score, confidence, assessment_type, safety_net = scorer.compute_risk_score(
        clinical_data, audio_features
    )
    feature_importance = scorer.get_feature_importance(clinical_data, audio_features)
    clinical_flags = scorer.get_clinical_flags(clinical_data, audio_features)
    
    return {
        'risk_score': risk_score,
        'confidence': confidence,
        'assessment_type': assessment_type,
        'safety_net_triggered': safety_net,
        'feature_importance': feature_importance,
        'clinical_flags': clinical_flags
    }