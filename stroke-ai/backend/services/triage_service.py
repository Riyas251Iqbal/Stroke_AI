"""
Triage Service
Orchestrates the complete clinical triage workflow including
clinical data processing, audio analysis, risk scoring, and triage decision.
"""

import os
import json
from typing import Dict, Optional, Tuple, List
from datetime import datetime

from utils.db import (
    execute_insert,
    execute_query,
    execute_update,
    get_user_by_id,
    log_audit
)
from utils.audio_features import AudioFeatureExtractor, extract_features_for_model
from utils.risk_scoring import StrokeRiskScorer
from utils.video_features import VideoFeatureExtractor
from utils.triage_logic import TriageDecisionEngine
from utils.helpers import (
    calculate_age,
    impute_missing_values,
    validate_clinical_data,
    calculate_target_evaluation_time
)
from services.notification_service import get_notification_service


class TriageService:
    """
    Comprehensive triage service for early stroke detection CDSS.
    Coordinates clinical assessment, audio analysis, and triage decisions.
    """
    
    def __init__(self):
        """Initialize triage service components."""
        self.audio_extractor = AudioFeatureExtractor()
        self.risk_scorer = StrokeRiskScorer()
        self.triage_engine = TriageDecisionEngine()
        self.video_extractor = VideoFeatureExtractor()
        
        # Audio upload directory
        self.audio_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            'audio',
            'uploads'
        )
        os.makedirs(self.audio_dir, exist_ok=True)
        
        # Video upload directory
        self.video_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            'video',
            'uploads'
        )
        os.makedirs(self.video_dir, exist_ok=True)
    
    def submit_clinical_data(self, patient_id: int, 
                            clinical_data: Dict) -> Tuple[bool, str, Optional[int]]:
        """
        Submit clinical data for a patient.
        Age is auto-calculated from patient's date_of_birth.
        
        Args:
            patient_id: Patient's user ID
            clinical_data: Dictionary of clinical variables (age will be calculated)
        
        Returns:
            Tuple of (success, message, submission_id)
        """
        # Validate patient and get DOB
        patient = get_user_by_id(patient_id)
        if not patient:
            return False, "Patient not found", None
        
        # ERROR 1 FIX: Auto-calculate age from date_of_birth
        if not patient.get('date_of_birth'):
            return False, "Date of birth not found. Please update your profile.", None
        
        try:
            calculated_age = calculate_age(patient['date_of_birth'])
        except ValueError as e:
            return False, f"Invalid date of birth: {str(e)}", None
        
        # Auto-read gender from user profile (like age from DOB)
        if not clinical_data.get('gender'):
            clinical_data['gender'] = patient.get('gender', 'Male')
        
        # ERROR 12 FIX: Validate clinical data
        try:
            validate_clinical_data(clinical_data)
        except ValueError as e:
            return False, str(e), None
        
        # ERROR 4 FIX: Impute missing BMI and glucose values
        imputed_data, imputed_fields = impute_missing_values(clinical_data)
        
        # Validate required fields
        required_fields = ['gender']
        for field in required_fields:
            if field not in imputed_data:
                return False, f"Missing required field: {field}", None
        
        try:
            # Insert clinical submission with calculated age and temporal context
            query = """
                INSERT INTO clinical_submissions (
                    patient_id, age, gender, hypertension, heart_disease,
                    diabetes, bmi, avg_glucose_level, smoking_status,
                    ever_married, work_type, residence_type, clinical_notes,
                    imputed_fields,
                    assessment_reason, symptom_onset_time, symptoms_during_recording
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            
            # Parse symptom_onset_time if provided
            symptom_onset = clinical_data.get('symptom_onset_time')
            if symptom_onset and isinstance(symptom_onset, str):
                try:
                    symptom_onset = datetime.fromisoformat(symptom_onset.replace('Z', '+00:00')).strftime('%Y-%m-%d %H:%M:%S')
                except ValueError:
                    symptom_onset = None
            
            params = (
                patient_id,
                calculated_age,  # Use calculated age instead of manual input
                imputed_data.get('gender'),
                imputed_data.get('hypertension', False),
                imputed_data.get('heart_disease', False),
                imputed_data.get('diabetes', False),
                imputed_data.get('bmi'),
                imputed_data.get('avg_glucose_level'),
                imputed_data.get('smoking_status', 'never'),
                imputed_data.get('ever_married', False),
                imputed_data.get('work_type'),
                imputed_data.get('residence_type', 'Urban'),
                imputed_data.get('clinical_notes'),
                json.dumps(imputed_fields) if imputed_fields else None,
                clinical_data.get('assessment_reason'),
                symptom_onset,
                clinical_data.get('symptoms_during_recording', False)
            )
            
            submission_id = execute_insert(query, params)
            
            # Log submission
            log_details = f"Age: {calculated_age}"
            if imputed_fields:
                log_details += f", Imputed: {', '.join(imputed_fields)}"
            
            log_audit(
                user_id=patient_id,
                action='clinical_data_submitted',
                resource_type='clinical_submission',
                resource_id=submission_id,
                details=log_details
            )
            
            return True, "Clinical data submitted successfully", submission_id
        
        except Exception as e:
            return False, f"Error submitting clinical data: {str(e)}", None
    
    def process_audio_upload(self, patient_id: int, audio_file,
                            clinical_submission_id: Optional[int] = None) -> Tuple[bool, str, Optional[int]]:
        """
        Process uploaded audio file and extract features.
        
        Args:
            patient_id: Patient's user ID
            audio_file: Audio file object (from Flask request.files)
            clinical_submission_id: Associated clinical submission ID
        
        Returns:
            Tuple of (success, message, audio_record_id)
        """
        # Validate patient
        patient = get_user_by_id(patient_id)
        if not patient:
            return False, "Patient not found", None
        
        # Validate file
        if not audio_file:
            return False, "No audio file provided", None
        
        allowed_extensions = ['wav', 'mp3', 'ogg', 'flac', 'm4a']
        filename = audio_file.filename
        file_ext = filename.rsplit('.', 1)[-1].lower()
        
        if file_ext not in allowed_extensions:
            return False, f"Invalid file format. Allowed: {', '.join(allowed_extensions)}", None
        
        try:
            # Save audio file
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            safe_filename = f"patient_{patient_id}_{timestamp}.{file_ext}"
            audio_path = os.path.join(self.audio_dir, safe_filename)
            
            audio_file.save(audio_path)
            
            # Extract legacy audio features (mfcc/prosody/timing)
            features = self.audio_extractor.extract_all_features(audio_path)
            
            # Extract 274-feature set for the new audio stroke model
            model_features = extract_features_for_model(audio_path)
            
            # Insert audio record
            query = """
                INSERT INTO audio_records (
                    patient_id, clinical_submission_id, audio_filename, audio_path,
                    duration_seconds, sample_rate, mfcc_features, prosody_features,
                    timing_features, audio_model_features, processing_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            
            params = (
                patient_id,
                clinical_submission_id,
                safe_filename,
                audio_path,
                features['metadata']['duration'],
                features['metadata']['sample_rate'],
                json.dumps(features['mfcc']),
                json.dumps(features['prosody']),
                json.dumps(features['timing']),
                json.dumps(model_features) if model_features else None,
                'processed'
            )
            
            audio_record_id = execute_insert(query, params)
            
            # Log audio processing
            log_audit(
                user_id=patient_id,
                action='audio_processed',
                resource_type='audio_record',
                resource_id=audio_record_id,
                details=f"Duration: {features['metadata']['duration']:.2f}s"
            )
            
            return True, "Audio processed successfully", audio_record_id
        
        except Exception as e:
            # Mark as failed if error occurs
            if 'audio_record_id' in locals():
                execute_query(
                    "UPDATE audio_records SET processing_status = 'failed', "
                    "processing_notes = ? WHERE id = ?",
                    (str(e), audio_record_id)
                )
            
            return False, f"Error processing audio: {str(e)}", None
    
    def process_video_upload(self, patient_id: int, video_file,
                            clinical_submission_id: Optional[int] = None) -> Tuple[bool, str, Optional[int]]:
        """
        Process uploaded facial video/image for video-based stroke detection.
        
        Args:
            patient_id: Patient's user ID
            video_file: Video or image file object (from Flask request.files)
            clinical_submission_id: Associated clinical submission ID
        
        Returns:
            Tuple of (success, message, video_record_id)
        """
        patient = get_user_by_id(patient_id)
        if not patient:
            return False, "Patient not found", None
        
        if not video_file:
            return False, "No video/image file provided", None
        
        allowed_extensions = ['jpg', 'jpeg', 'png', 'bmp', 'webp', 'mp4', 'webm', 'avi', 'mov', 'ogg', 'mkv']
        filename = video_file.filename
        file_ext = filename.rsplit('.', 1)[-1].lower()
        
        if file_ext not in allowed_extensions:
            return False, f"Invalid file format. Allowed: {', '.join(allowed_extensions)}", None
        
        try:
            # Save image file
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            safe_filename = f"patient_{patient_id}_{timestamp}.{file_ext}"
            video_path = os.path.join(self.video_dir, safe_filename)
            video_file.save(video_path)
            
            # Run video prediction
            prediction = self.video_extractor.predict(video_path)
            
            processing_status = 'processed' if prediction.get('risk_score') is not None else 'failed'
            processing_notes = prediction.get('error', None)
            
            # Insert video record
            query = """
                INSERT INTO video_records (
                    patient_id, clinical_submission_id, video_filename, video_path,
                    risk_score, severity, region_scores, region_labels,
                    region_confidences, confidence,
                    processing_status, processing_notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            
            params = (
                patient_id,
                clinical_submission_id,
                safe_filename,
                video_path,
                prediction.get('risk_score'),
                prediction.get('severity'),
                json.dumps(prediction.get('region_scores', {})),
                json.dumps(prediction.get('region_labels', {})),
                json.dumps(prediction.get('region_confidences', {})),
                prediction.get('confidence'),
                processing_status,
                processing_notes
            )
            
            video_record_id = execute_insert(query, params)
            
            log_audit(
                user_id=patient_id,
                action='video_processed',
                resource_type='video_record',
                resource_id=video_record_id,
                details=f"Severity: {prediction.get('severity', 'N/A')}, Risk: {prediction.get('risk_score', 'N/A')}"
            )
            
            return True, "Video processed successfully", video_record_id
        
        except Exception as e:
            return False, f"Error processing video: {str(e)}", None
    
    def perform_triage_assessment(self, patient_id: int,
                                 clinical_submission_id: int,
                                 audio_record_id: Optional[int] = None,
                                 video_record_id: Optional[int] = None) -> Tuple[bool, str, Optional[Dict]]:
        """
        Perform complete triage assessment combining clinical, audio, and video data.
        
        Args:
            patient_id: Patient's user ID
            clinical_submission_id: Clinical submission ID
            audio_record_id: Audio record ID (optional)
            video_record_id: Video record ID (optional)
        
        Returns:
            Tuple of (success, message, triage_result)
        """
        try:
            # Get clinical data
            clinical_query = "SELECT * FROM clinical_submissions WHERE id = ?"
            clinical_data = execute_query(clinical_query, (clinical_submission_id,), fetch_one=True)
            
            if not clinical_data:
                return False, "Clinical submission not found", None
            
            # Convert Row to dict and parse JSON fields
            print(f"DEBUG: clinical_data type: {type(clinical_data)}")
            clinical_data = dict(clinical_data)
            print(f"DEBUG: clinical_data dict: {clinical_data}")
            if clinical_data.get('imputed_fields'):
                print(f"DEBUG: imputed_fields raw: {clinical_data['imputed_fields']} type: {type(clinical_data['imputed_fields'])}")
                
            if clinical_data.get('imputed_fields') and isinstance(clinical_data['imputed_fields'], str):
                try:
                    clinical_data['imputed_fields'] = json.loads(clinical_data['imputed_fields'])
                    print(f"DEBUG: imputed_fields parsed: {clinical_data['imputed_fields']}")
                except Exception as e:
                    print(f"DEBUG: JSON parse error: {e}")
                    clinical_data['imputed_fields'] = []
            
            # Get audio features if available
            audio_features = None
            audio_model_features = None
            if audio_record_id:
                audio_query = "SELECT * FROM audio_records WHERE id = ?"
                audio_record = execute_query(audio_query, (audio_record_id,), fetch_one=True)
                
                if audio_record:
                    audio_features = {
                        'mfcc': json.loads(audio_record['mfcc_features']),
                        'prosody': json.loads(audio_record['prosody_features']),
                        'timing': json.loads(audio_record['timing_features'])
                    }
                    # Load 274-feature model features if available
                    if audio_record.get('audio_model_features'):
                        audio_model_features = json.loads(audio_record['audio_model_features'])
                    
                    print(f"\n[DEBUG] Audio Features for Assessment:")
                    print(f"Speech Rate: {audio_features['timing'].get('speech_rate')}")
                    print(f"Pause Rate:  {audio_features['timing'].get('pause_rate')}")
                    print(f"Pitch Std:   {audio_features['prosody'].get('pitch_std')}")
                    print(f"New Model Features: {'274 loaded' if audio_model_features else 'not available'}")
            
            # Get video results if available
            video_risk_data = None
            if video_record_id:
                video_query = "SELECT * FROM video_records WHERE id = ?"
                video_record = execute_query(video_query, (video_record_id,), fetch_one=True)
                
                if video_record and video_record.get('risk_score') is not None:
                    video_risk_data = {
                        'risk_score': video_record['risk_score'],
                        'severity': video_record['severity'],
                        'region_scores': json.loads(video_record['region_scores']) if video_record.get('region_scores') else {},
                        'region_labels': json.loads(video_record['region_labels']) if video_record.get('region_labels') else {},
                        'region_confidences': json.loads(video_record['region_confidences']) if video_record.get('region_confidences') else {},
                        'confidence': video_record['confidence']
                    }
                    print(f"\n[DEBUG] Video Risk Data: severity={video_risk_data['severity']}, risk={video_risk_data['risk_score']}")
            
            # Compute risk score with all available modalities
            risk_score, confidence, assessment_type, safety_net_triggered = self.risk_scorer.compute_risk_score(
                clinical_data, audio_features, audio_model_features, video_risk_data
            )
            
            # Get feature importance and flags (including video)
            feature_importance = self.risk_scorer.get_feature_importance(
                clinical_data, audio_features
            )
            video_importance = self.risk_scorer.get_video_importance(video_risk_data)
            feature_importance.update(video_importance)
            
            clinical_flags = self.risk_scorer.get_clinical_flags(
                clinical_data, audio_features
            )
            video_flags = self.risk_scorer.get_video_flags(video_risk_data)
            clinical_flags.extend(video_flags)
            
            # Generate triage decision
            triage_report = self.triage_engine.create_triage_report(
                risk_score, confidence, clinical_flags, feature_importance
            )
            
            # Issue #5: Apply temporal context escalation
            from utils.triage_logic import TriageLevel
            current_level = TriageLevel(triage_report['triage_level'])
            escalated_level = self.triage_engine.adjust_triage_for_temporal_context(
                current_level, clinical_data
            )
            if escalated_level != current_level:
                triage_report['triage_level'] = escalated_level.value
                triage_report['recommendation'] = self.triage_engine.generate_recommendation(
                    escalated_level, risk_score, clinical_flags
                )
                print(f"(!) TEMPORAL ESCALATION: {current_level.value} → {escalated_level.value}")
            
            # Issue #8: Apply confidence-based escalation
            current_level = TriageLevel(triage_report['triage_level'])
            final_level, requires_senior_review = self.triage_engine.apply_confidence_escalation(
                current_level, confidence
            )
            if final_level != current_level:
                triage_report['triage_level'] = final_level.value
                triage_report['recommendation'] = self.triage_engine.generate_recommendation(
                    final_level, risk_score, clinical_flags
                )
                print(f"(!) CONFIDENCE ESCALATION: {current_level.value} → {final_level.value} (confidence={confidence:.2f})")
            
            # Calculate target evaluation time
            target_eval_time = calculate_target_evaluation_time(
                triage_report['triage_level']
            )
            
            # Determine safety net findings
            safety_net_findings = None
            if safety_net_triggered:
                # Extract audio-specific flags for findings
                audio_flags = [f for f in clinical_flags if "speech" in f.lower() or "slurred" in f.lower()]
                safety_net_findings = "; ".join(audio_flags) if audio_flags else "Critical audio anomalies detected"
                # Ensure triage level is Emergency if safety net triggered
                if triage_report['triage_level'] != 'Emergency':
                    triage_report['triage_level'] = 'Emergency'
                    triage_report['recommendation'] = 'Immediate medical attention required (Safety Net Triggered)'

            # Save triage result
            triage_query = """
                INSERT INTO triage_results (
                    patient_id, clinical_submission_id, audio_record_id, video_record_id,
                    risk_score, triage_level, confidence_score,
                    feature_importance, clinical_flags, recommendation,
                    assessment_type, target_evaluation_time,
                    safety_net_triggered, safety_net_findings,
                    video_severity, video_region_details,
                    review_status, requires_immediate_review
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            
            triage_params = (
                patient_id,
                clinical_submission_id,
                audio_record_id,
                video_record_id,
                triage_report['risk_score'],
                triage_report['triage_level'],
                triage_report['confidence_score'],
                json.dumps(triage_report['feature_importance']),
                json.dumps(triage_report['clinical_flags']),
                triage_report['recommendation'],
                assessment_type,
                target_eval_time.strftime('%Y-%m-%d %H:%M:%S') if target_eval_time else None,
                safety_net_triggered,
                safety_net_findings,
                video_risk_data.get('severity') if video_risk_data else None,
                json.dumps(video_risk_data) if video_risk_data else None,
                'pending',  # Issue #10: Initial review status
                requires_senior_review  # Issue #8
            )
            
            triage_result_id = execute_insert(triage_query, triage_params)
            
            # Add triage result ID and metadata to report
            triage_report['triage_result_id'] = triage_result_id
            triage_report['assessment_type'] = assessment_type
            triage_report['target_evaluation_time'] = target_eval_time.strftime('%Y-%m-%d %H:%M:%S') if target_eval_time else None
            triage_report['safety_net_triggered'] = safety_net_triggered
            triage_report['requires_senior_review'] = requires_senior_review
            
            # Issue #4: Send emergency notification
            if triage_report['triage_level'] == 'Emergency':
                try:
                    patient = get_user_by_id(patient_id)
                    notification_service = get_notification_service()
                    notification_service.send_emergency_alert(
                        triage_result=triage_report,
                        patient_info=patient if patient else {'id': patient_id}
                    )
                except Exception as notif_err:
                    print(f"⚠ Notification error (non-fatal): {notif_err}")
            
            # Log triage assessment
            log_details = f"Triage Level: {triage_report['triage_level']}, Risk: {risk_score:.3f}, Type: {assessment_type}"
            if safety_net_triggered:
                log_details += " [SAFETY NET TRIGGERED]"
            if requires_senior_review:
                log_details += " [LOW CONFIDENCE - SENIOR REVIEW]"
            if not audio_record_id:
                log_details += " (No audio)"
            
            log_audit(
                user_id=patient_id,
                action='triage_assessed',
                resource_type='triage_result',
                resource_id=triage_result_id,
                details=log_details
            )
            
            return True, "Triage assessment completed", triage_report
        
        except Exception as e:
            return False, f"Error performing triage assessment: {str(e)}", None
    
    def get_patient_history(self, patient_id: int, limit: int = 10) -> List[Dict]:
        """
        Get patient's triage history.
        
        Args:
            patient_id: Patient's user ID
            limit: Maximum results
        
        Returns:
            List of triage results
        """
        query = """
            SELECT 
                tr.id, tr.risk_score, tr.triage_level, tr.confidence_score,
                tr.assessment_date, tr.recommendation, tr.assessment_type,
                tr.video_severity, tr.video_record_id,
                cs.age, cs.hypertension, cs.diabetes, cs.bmi,
                ar.audio_filename
            FROM triage_results tr
            JOIN clinical_submissions cs ON tr.clinical_submission_id = cs.id
            LEFT JOIN audio_records ar ON tr.audio_record_id = ar.id
            WHERE tr.patient_id = ?
            ORDER BY tr.assessment_date DESC
            LIMIT ?
        """
        
        return execute_query(query, (patient_id, limit))
    
    def get_triage_result_details(self, triage_result_id: int) -> Optional[Dict]:
        """
        Get detailed triage result information.
        
        Args:
            triage_result_id: Triage result ID
        
        Returns:
            Detailed triage information
        """
        query = """
            SELECT 
                tr.*,
                cs.age, cs.gender, cs.hypertension, cs.heart_disease,
                cs.diabetes, cs.bmi, cs.avg_glucose_level, cs.smoking_status,
                cs.imputed_fields,
                ar.audio_filename, ar.duration_seconds,
                u.full_name as patient_name, u.email as patient_email, u.address as patient_address
            FROM triage_results tr
            JOIN clinical_submissions cs ON tr.clinical_submission_id = cs.id
            JOIN users u ON tr.patient_id = u.id
            LEFT JOIN audio_records ar ON tr.audio_record_id = ar.id
            WHERE tr.id = ?
        """
        
        result = execute_query(query, (triage_result_id,), fetch_one=True)
        
        if result:
            # Parse JSON fields
            result['feature_importance'] = json.loads(result['feature_importance'])
            result['clinical_flags'] = json.loads(result['clinical_flags'])
            if result.get('imputed_fields'):
                result['imputed_fields'] = json.loads(result['imputed_fields'])
        
        return result
    
    def add_doctor_review(self, triage_result_id: int, doctor_id: int,
                         note_content: str, note_type: str = 'review',
                         doctor_override: bool = False,
                         new_triage_level: Optional[str] = None,
                         override_reason: Optional[str] = None) -> Tuple[bool, str]:
        """
        Add doctor review to triage result.
        
        Args:
            triage_result_id: Triage result ID
            doctor_id: Doctor's user ID
            note_content: Review note content
            note_type: Type of note (review, follow-up, escalation, discharge)
            doctor_override: Whether doctor overrides triage decision
            new_triage_level: New triage level if overriding
            override_reason: Reason for override
        
        Returns:
            Tuple of (success, message)
        """
        # Get triage result
        triage_result = execute_query(
            "SELECT patient_id, triage_level FROM triage_results WHERE id = ?",
            (triage_result_id,), fetch_one=True
        )
        
        if not triage_result:
            return False, "Triage result not found"
        
        try:
            # Prepare update query with review status (Issue #10)
            if doctor_override and new_triage_level:
                # Require override reason when changing triage level (Issue #3)
                if not override_reason:
                    return False, "Override reason is required when changing triage level"
                
                query = """UPDATE triage_results 
                           SET reviewed_by_doctor = ?, review_date = CURRENT_TIMESTAMP,
                               doctor_override = ?,
                               original_triage_level = ?,
                               triage_level = ?,
                               override_reason = ?,
                               override_timestamp = CURRENT_TIMESTAMP,
                               review_status = 'reviewed'
                           WHERE id = ?"""
                params = (doctor_id, doctor_override, triage_result['triage_level'],
                          new_triage_level, override_reason, triage_result_id)
            else:
                query = """UPDATE triage_results 
                           SET reviewed_by_doctor = ?, review_date = CURRENT_TIMESTAMP,
                               doctor_override = ?,
                               review_status = 'reviewed'
                           WHERE id = ?"""
                params = (doctor_id, doctor_override, triage_result_id)

            execute_query(query, params)
            
            # Add doctor note
            note_query = """
                INSERT INTO doctor_notes (
                    triage_result_id, doctor_id, patient_id,
                    note_type, note_content
                ) VALUES (?, ?, ?, ?, ?)
            """
            
            execute_insert(note_query, (
                triage_result_id, doctor_id, triage_result['patient_id'],
                note_type, note_content
            ))
            
            # Log review with structured data (Issue #14)
            log_details = f"Override: {doctor_override}"
            if doctor_override and new_triage_level:
                log_details += f", Changed: {triage_result['triage_level']} → {new_triage_level}, Reason: {override_reason}"
            
            log_audit(
                user_id=doctor_id,
                action='triage_reviewed',
                resource_type='triage_result',
                resource_id=triage_result_id,
                details=log_details
            )
            
            return True, "Doctor review added successfully"
        
        except Exception as e:
            return False, f"Error adding review: {str(e)}"