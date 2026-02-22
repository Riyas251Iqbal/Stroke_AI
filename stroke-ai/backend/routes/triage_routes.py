"""
Triage Routes
API endpoints for clinical triage assessment workflow.
Handles clinical data submission, audio upload, and triage evaluation.
"""

from flask import Blueprint, request, jsonify
from services.auth_service import token_required, role_required
from services.triage_service import TriageService
from utils.db import log_audit, execute_query


triage_bp = Blueprint('triage', __name__, url_prefix='/api/triage')
triage_service = TriageService()


@triage_bp.route('/submit-clinical', methods=['POST'])
@token_required
@role_required('patient', 'doctor', 'admin')
def submit_clinical_data(current_user):
    """
    Submit clinical data for triage assessment.
    
    Request body:
        {
            "age": int,
            "gender": "Male|Female|Other",
            "hypertension": boolean,
            "heart_disease": boolean,
            "diabetes": boolean,
            "bmi": float (optional),
            "avg_glucose_level": float (optional),
            "smoking_status": "never|formerly|current",
            "ever_married": boolean,
            "work_type": string,
            "residence_type": "Urban|Rural",
            "clinical_notes": string (optional)
        }
    """
    try:
        data = request.get_json()
        
        # Patient ID (use current user for patients, or specified patient for doctors/admins)
        patient_id = current_user['id']
        if current_user['role'] in ['doctor', 'admin'] and 'patient_id' in data:
            patient_id = data['patient_id']
        
        # Submit clinical data
        success, message, submission_id = triage_service.submit_clinical_data(
            patient_id=patient_id,
            clinical_data=data
        )
        
        if success:
            return jsonify({
                'message': message,
                'submission_id': submission_id
            }), 201
        else:
            return jsonify({'error': message}), 400
    
    except Exception as e:
        return jsonify({'error': f'Clinical submission error: {str(e)}'}), 500


@triage_bp.route('/upload-audio', methods=['POST'])
@token_required
@role_required('patient', 'doctor', 'admin')
def upload_audio(current_user):
    """
    Upload speech audio file for analysis.
    
    Form data:
        audio_file: audio file (wav, mp3, ogg, flac, m4a)
        clinical_submission_id: int (optional)
    """
    try:
        # Check if audio file is present
        if 'audio_file' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio_file']
        
        # Get optional clinical submission ID
        clinical_submission_id = request.form.get('clinical_submission_id')
        if clinical_submission_id:
            clinical_submission_id = int(clinical_submission_id)
        
        # Patient ID
        patient_id = current_user['id']
        if current_user['role'] in ['doctor', 'admin'] and 'patient_id' in request.form:
            patient_id = int(request.form['patient_id'])
        
        # Process audio
        success, message, audio_record_id = triage_service.process_audio_upload(
            patient_id=patient_id,
            audio_file=audio_file,
            clinical_submission_id=clinical_submission_id
        )
        
        if success:
            return jsonify({
                'message': message,
                'audio_record_id': audio_record_id
            }), 201
        else:
            return jsonify({'error': message}), 400
    
    except Exception as e:
        return jsonify({'error': f'Audio upload error: {str(e)}'}), 500


@triage_bp.route('/assess', methods=['POST'])
@token_required
@role_required('patient', 'doctor', 'admin')
def perform_assessment(current_user):
    """
    Perform complete triage assessment.
    
    Request body:
        {
            "clinical_submission_id": int,
            "audio_record_id": int (optional)
        }
    """
    try:
        data = request.get_json()
        
        if 'clinical_submission_id' not in data:
            return jsonify({'error': 'clinical_submission_id required'}), 400
        
        # Patient ID
        patient_id = current_user['id']
        if current_user['role'] in ['doctor', 'admin'] and 'patient_id' in data:
            patient_id = data['patient_id']
        
        # Perform triage assessment
        success, message, triage_result = triage_service.perform_triage_assessment(
            patient_id=patient_id,
            clinical_submission_id=data['clinical_submission_id'],
            audio_record_id=data.get('audio_record_id')
        )
        
        if success:
            return jsonify({
                'message': message,
                'triage_result': triage_result
            }), 200
        else:
            return jsonify({'error': message}), 400
    
    except Exception as e:
        return jsonify({'error': f'Assessment error: {str(e)}'}), 500


@triage_bp.route('/complete-assessment', methods=['POST'])
@token_required
@role_required('patient', 'doctor', 'admin')
def complete_assessment(current_user):
    """
    Complete workflow: Submit clinical data, upload audio, and perform assessment.
    Age is auto-calculated from patient's date_of_birth.
    
    Form data:
        Clinical data fields (gender, hypertension, etc.) - NO age field
        audio_file: audio file (optional)
    """
    try:
        # Get patient ID
        patient_id = current_user['id']
        
        # Extract clinical data from form (age & gender are auto-read from profile)
        clinical_data = {
            # 'age' removed - now auto-calculated from DOB
            # 'gender' removed - now auto-read from user profile
            'gender': request.form.get('gender'),  # optional override, backend will use profile if missing
            'hypertension': request.form.get('hypertension', 'false').lower() == 'true',
            'heart_disease': request.form.get('heart_disease', 'false').lower() == 'true',
            'diabetes': request.form.get('diabetes', 'false').lower() == 'true',
            'bmi': float(request.form.get('bmi')) if request.form.get('bmi') else None,
            'avg_glucose_level': float(request.form.get('avg_glucose_level')) if request.form.get('avg_glucose_level') else None,
            'smoking_status': request.form.get('smoking_status', 'never'),
            'ever_married': request.form.get('ever_married', 'false').lower() == 'true',
            'work_type': request.form.get('work_type'),
            'residence_type': request.form.get('residence_type', 'Urban'),
            'clinical_notes': request.form.get('clinical_notes'),
            # Issue #5: Temporal context
            'assessment_reason': request.form.get('assessment_reason'),
            'symptom_onset_time': request.form.get('symptom_onset_time'),
            'symptoms_during_recording': request.form.get('symptoms_during_recording', 'false').lower() == 'true',
        }
        
        # Submit clinical data
        success, message, submission_id = triage_service.submit_clinical_data(
            patient_id=patient_id,
            clinical_data=clinical_data
        )
        
        if not success:
            return jsonify({'error': message}), 400
        
        # Process audio if provided
        audio_record_id = None
        if 'audio_file' in request.files:
            audio_file = request.files['audio_file']
            success, message, audio_record_id = triage_service.process_audio_upload(
                patient_id=patient_id,
                audio_file=audio_file,
                clinical_submission_id=submission_id
            )
            
            if not success:
                return jsonify({'error': f'Audio processing failed: {message}'}), 400
        
        # Perform triage assessment
        success, message, triage_result = triage_service.perform_triage_assessment(
            patient_id=patient_id,
            clinical_submission_id=submission_id,
            audio_record_id=audio_record_id
        )
        
        if success:
            # Auto-alert: notify assigned doctor/hospital on High or Emergency risk
            triage_level = triage_result.get('triage_level', '')
            if triage_level in ('High', 'Emergency'):
                try:
                    from services.notification_service import get_notification_service
                    from utils.db import execute_query
                    
                    # Get patient's profile with address, assigned doctor, and hospital
                    patient = execute_query(
                        """SELECT u.id, u.full_name, u.email, u.phone, u.address,
                                  u.preferred_doctor_id, u.hospital_id,
                                  h.name as hospital_name, h.phone as hospital_phone
                           FROM users u
                           LEFT JOIN hospitals h ON u.hospital_id = h.id
                           WHERE u.id = ?""",
                        (patient_id,)
                    )
                    
                    patient_info = patient[0] if patient else {}
                    patient_info['address'] = patient_info.get('address', 'Address not provided')
                    
                    notification_service = get_notification_service()
                    notification_service.send_emergency_alert(
                        triage_result=triage_result,
                        patient_info=patient_info
                    )
                    print(f"[ALERT] Emergency alert sent for patient {patient_id} - Level: {triage_level}")
                except Exception as e:
                    print(f"[WARN] Failed to send emergency alert: {e}")
            
            return jsonify({
                'message': 'Complete assessment finished successfully',
                'triage_result': triage_result
            }), 200
        else:
            return jsonify({'error': message}), 400
    
    except Exception as e:
        return jsonify({'error': f'Complete assessment error: {str(e)}'}), 500


@triage_bp.route('/history', methods=['GET'])
@token_required
def get_triage_history(current_user):
    """
    Get patient's triage history.
    
    Query params:
        patient_id: int (optional, for doctors/admins)
        limit: int (default: 10)
    """
    try:
        # Determine patient ID
        patient_id = current_user['id']
        if current_user['role'] in ['doctor', 'admin']:
            patient_id = request.args.get('patient_id', patient_id, type=int)
        
        limit = request.args.get('limit', 10, type=int)
        
        # Get history
        history = triage_service.get_patient_history(patient_id, limit)
        
        return jsonify({
            'history': history,
            'count': len(history)
        }), 200
    
    except Exception as e:
        return jsonify({'error': f'Error fetching history: {str(e)}'}), 500


@triage_bp.route('/result/<int:triage_result_id>', methods=['GET'])
@token_required
def get_triage_result(current_user, triage_result_id):
    """Get detailed triage result by ID."""
    try:
        result = triage_service.get_triage_result_details(triage_result_id)
        
        if not result:
            return jsonify({'error': 'Triage result not found'}), 404
        
        # Check authorization
        if current_user['role'] == 'patient' and result['patient_id'] != current_user['id']:
            return jsonify({'error': 'Access denied'}), 403
        
        return jsonify({'result': result}), 200
    
    except Exception as e:
        return jsonify({'error': f'Error fetching result: {str(e)}'}), 500


@triage_bp.route('/review', methods=['POST'])
@token_required
@role_required('doctor', 'admin')
def add_doctor_review(current_user):
    """
    Add doctor review to triage result.
    
    Request body:
        {
            "triage_result_id": int,
            "note_content": string,
            "note_type": "review|follow-up|escalation|discharge",
            "doctor_override": boolean (optional)
        }
    """
    try:
        data = request.get_json()
        
        required = ['triage_result_id', 'note_content']
        for field in required:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        success, message = triage_service.add_doctor_review(
            triage_result_id=data['triage_result_id'],
            doctor_id=current_user['id'],
            note_content=data['note_content'],
            note_type=data.get('note_type', 'review'),
            doctor_override=data.get('doctor_override', False),
            new_triage_level=data.get('new_triage_level'),
            override_reason=data.get('override_reason')
        )
        
        if success:
            return jsonify({'message': message}), 200
        else:
            return jsonify({'error': message}), 400
    
    except Exception as e:
        return jsonify({'error': f'Review error: {str(e)}'}), 500


@triage_bp.route('/pending', methods=['GET'])
@token_required
@role_required('doctor', 'admin')
def get_pending_cases(current_user):
    """
    Get pending triage cases for doctor review.
    
    Query params:
        triage_level: Low|Medium|Emergency (optional filter)
    """
    try:
        triage_level = request.args.get('triage_level')
        
        query = """
            SELECT 
                tr.id, tr.risk_score, tr.triage_level, tr.confidence_score,
                tr.assessment_date, tr.clinical_flags, tr.preferred_doctor_id,
                u.full_name as patient_name, u.email as patient_email,
                cs.age, cs.hypertension, cs.diabetes, cs.heart_disease
            FROM triage_results tr
            JOIN users u ON tr.patient_id = u.id
            JOIN clinical_submissions cs ON tr.clinical_submission_id = cs.id
            WHERE tr.reviewed_by_doctor IS NULL
              AND u.preferred_doctor_id = ?
        """
        
        params = [current_user['id']]
        if triage_level:
            query += " AND tr.triage_level = ?"
            params.append(triage_level)
        
        query += """
            ORDER BY 
                CASE tr.triage_level
                    WHEN 'Emergency' THEN 1
                    WHEN 'Medium' THEN 2
                    WHEN 'Low' THEN 3
                END,
                tr.assessment_date ASC
        """
        
        cases = execute_query(query, tuple(params))
        
        # Parse JSON fields
        for case in cases:
            import json
            case['clinical_flags'] = json.loads(case['clinical_flags'])
        
        return jsonify({
            'pending_cases': cases,
            'count': len(cases)
        }), 200
    
    except Exception as e:
        return jsonify({'error': f'Error fetching pending cases: {str(e)}'}), 500


@triage_bp.route('/request-deletion', methods=['POST'])
@token_required
@role_required('patient', 'doctor')
def request_account_deletion(current_user):
    """Submit a request to delete the current user's account."""
    try:
        data = request.get_json() or {}
        reason = data.get('reason', '')

        # Check for existing pending request
        existing = execute_query(
            "SELECT id FROM deletion_requests WHERE user_id = ? AND status = 'pending'",
            (current_user['id'],),
            fetch_one=True
        )
        if existing:
            return jsonify({'error': 'You already have a pending deletion request'}), 400

        from utils.db import execute_insert
        req_id = execute_insert(
            "INSERT INTO deletion_requests (user_id, reason) VALUES (?, ?)",
            (current_user['id'], reason)
        )

        log_audit(
            user_id=current_user['id'],
            action='deletion_requested',
            resource_type='user',
            resource_id=current_user['id'],
            details=f'Reason: {reason}'
        )

        return jsonify({
            'message': 'Account deletion request submitted. An admin will review your request.',
            'request_id': req_id
        }), 201

    except Exception as e:
        return jsonify({'error': f'Error submitting deletion request: {str(e)}'}), 500


@triage_bp.route('/deletion-status', methods=['GET'])
@token_required
@role_required('patient', 'doctor')
def get_deletion_status(current_user):
    """Check if the current user has a pending deletion request."""
    try:
        req = execute_query(
            "SELECT id, status, requested_at, review_note FROM deletion_requests WHERE user_id = ? ORDER BY requested_at DESC LIMIT 1",
            (current_user['id'],),
            fetch_one=True
        )
        return jsonify({'deletion_request': dict(req) if req else None}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500