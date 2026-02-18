"""
Early Stroke Risk Scoring Engine
Evaluates clinical and audio features to compute stroke risk scores
for the Clinical Decision Support System (CDSS).

Supports the dual-model architecture:
  - Clinical Model: Logistic Regression (18 features)
  - Audio Model: GradientBoosting Classifier (37 features)
  - Ensemble: Weighted combination (default 60% clinical + 40% audio)
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
        self.audio_model = None
        self.clinical_scaler = None
        self.audio_scaler = None
        self.feature_names = None
        self.metadata = None
        
        # Ensemble weights (defaults, overridden by metadata)
        self.clinical_weight = 0.6
        self.audio_weight = 0.4
        
        # Triage thresholds (defaults, overridden by metadata)
        self.thresholds = {
            'low': 0.30,
            'moderate': 0.60,
            'high': 0.85
        }
        
        self._load_models()
    
    def _load_models(self):
        """Load all model components from the models directory."""
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
        
        # Apply metadata configuration
        if self.metadata:
            config = self.metadata.get('ensemble_config', {})
            self.clinical_weight = config.get('clinical_weight', 0.6)
            self.audio_weight = config.get('audio_weight', 0.4)
        
        # Report status
        status = []
        if self.clinical_model: status.append('Clinical')
        if self.audio_model: status.append('Audio')
        if self.clinical_scaler: status.append('ClinicalScaler')
        if self.audio_scaler: status.append('AudioScaler')
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
        Prepare audio features as a flat 37-element vector for the audio model.
        
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
    
    # ──────────────────────────────────────────────
    # Risk Computation
    # ──────────────────────────────────────────────
    
    def compute_risk_score(self, clinical_data: Dict, 
                          audio_features: Optional[Dict] = None) -> Tuple[float, float, str, bool]:
        """
        Compute early stroke risk score combining clinical and audio models.
        
        Returns:
            Tuple of (risk_score, confidence, assessment_type, safety_net_triggered)
        """
        try:
            print("\n" + "="*60)
            print("DIAGNOSTIC: Risk Scoring Engine (Dual Model)")
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
            
            # Always compute rule-based clinical risk as a safety floor
            # (the ML model is age-biased and underestimates risk for younger patients)
            rule_clinical_risk = self._calculate_rule_based_risk(clinical_data, None)
            print(f"Rule-Based Clinical Risk: {rule_clinical_risk:.4f}")
            
            # Hybrid combination: blend ML + rules, never go below rule-based floor
            if model_clinical_risk > 0:
                # 60% ML model + 40% rule-based, but always at least the rule-based score
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
            assessment_type = 'clinical_only'
            
            if audio_features:
                assessment_type = 'full'
                has_audio = True
                print("\n--- Audio Analysis ---")
                
                audio_vec = self.prepare_audio_features(audio_features)
                
                if audio_vec is not None and self.audio_model:
                    if self.audio_scaler:
                        scaled_audio = self.audio_scaler.transform(audio_vec)
                    else:
                        scaled_audio = audio_vec
                    
                    probs = self.audio_model.predict_proba(scaled_audio)
                    model_audio_risk = float(probs[0][1]) if probs.shape[1] > 1 else 0.0
                    print(f"Audio Model Prediction: {model_audio_risk:.4f}")
                else:
                    model_audio_risk = 0.0
                    print("Audio model not available, using rules only")
                
                # Rule-based safety net
                rule_audio_risk = self._calculate_audio_rule_risk(audio_features)
                print(f"Rule-Based Audio Risk: {rule_audio_risk:.4f}")
                
                # Hybrid: trust the higher signal
                audio_risk = max(model_audio_risk, rule_audio_risk)
                
                if rule_audio_risk > model_audio_risk + 0.2:
                    safety_net_triggered = True
                    print(f"(!) SAFETY NET: Rules ({rule_audio_risk:.4f}) > Model ({model_audio_risk:.4f})")
                
                print(f"Final Audio Risk: {audio_risk:.4f}")
            else:
                print("\n  No audio features - clinical only assessment")
            
            # 3. Ensemble
            if has_audio:
                final_risk = (self.clinical_weight * clinical_risk) + (self.audio_weight * audio_risk)
                confidence = 0.85
                print(f"\nEnsemble: ({self.clinical_weight}*{clinical_risk:.4f}) + ({self.audio_weight}*{audio_risk:.4f}) = {final_risk:.4f}")
            else:
                final_risk = clinical_risk
                confidence = 0.65
                print(f"\nFinal Risk (clinical only): {final_risk:.4f}")
            
            # Confidence adjustments
            imputed_fields = clinical_data.get('imputed_fields', [])
            if imputed_fields:
                penalty = 0.05 * len(imputed_fields)
                confidence = max(0.5, confidence - penalty)
            
            # Safety net override for critical audio signs
            if has_audio and rule_audio_risk >= 0.8:
                if final_risk < 0.85:
                    print(f"(!) CRITICAL OVERRIDE: {final_risk:.4f} -> 0.85")
                    final_risk = 0.85
                    safety_net_triggered = True
            elif has_audio and rule_audio_risk >= 0.65:
                if final_risk < 0.60:
                    print(f"(!) SAFETY OVERRIDE: {final_risk:.4f} -> 0.60")
                    final_risk = 0.60
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