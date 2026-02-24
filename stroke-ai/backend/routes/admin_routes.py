"""
Admin Routes
API endpoints for administrative functions including
system analytics, user management, and audit logs.
"""

from flask import Blueprint, request, jsonify
import os
from services.auth_service import token_required, role_required
from utils.db import execute_query, execute_update, log_audit


admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')


@admin_bp.route('/stats', methods=['GET'])
@token_required
@role_required('admin', 'doctor')
def get_system_stats(current_user):
    """
    Get system statistics and analytics.
    
    Returns:
        {
            "total_users": int,
            "total_patients": int,
            "total_doctors": int,
            "total_assessments": int,
            "emergency_cases": int,
            "pending_reviews": int,
            "assessments_today": int
        }
    """
    try:
        stats = {}
        
        # Total users by role
        users_query = """
            SELECT role, COUNT(*) as count 
            FROM users 
            WHERE is_active = 1 
            GROUP BY role
        """
        users_by_role = execute_query(users_query)
        
        stats['total_users'] = sum(row['count'] for row in users_by_role)
        stats['total_patients'] = next((row['count'] for row in users_by_role if row['role'] == 'patient'), 0)
        stats['total_doctors'] = next((row['count'] for row in users_by_role if row['role'] == 'doctor'), 0)
        stats['total_admins'] = next((row['count'] for row in users_by_role if row['role'] == 'admin'), 0)
        
        # Total triage assessments
        total_assessments = execute_query(
            "SELECT COUNT(*) as count FROM triage_results",
            fetch_one=True
        )
        stats['total_assessments'] = total_assessments['count']
        
        # Assessments by triage level
        by_level = execute_query("""
            SELECT triage_level, COUNT(*) as count 
            FROM triage_results 
            GROUP BY triage_level
        """)
        stats['emergency_cases'] = next((row['count'] for row in by_level if row['triage_level'] == 'Emergency'), 0)
        stats['medium_cases'] = next((row['count'] for row in by_level if row['triage_level'] == 'Medium'), 0)
        stats['low_cases'] = next((row['count'] for row in by_level if row['triage_level'] == 'Low'), 0)
        
        # Pending reviews
        pending = execute_query(
            "SELECT COUNT(*) as count FROM triage_results WHERE reviewed_by_doctor IS NULL",
            fetch_one=True
        )
        stats['pending_reviews'] = pending['count']
        
        # Assessments today
        today = execute_query(
            "SELECT COUNT(*) as count FROM triage_results WHERE DATE(assessment_date) = DATE('now')",
            fetch_one=True
        )
        stats['assessments_today'] = today['count']
        
        # Average risk score
        avg_risk = execute_query(
            "SELECT AVG(risk_score) as avg_risk FROM triage_results",
            fetch_one=True
        )
        stats['average_risk_score'] = round(avg_risk['avg_risk'] or 0, 3)
        
        return jsonify({'stats': stats}), 200
    
    except Exception as e:
        return jsonify({'error': f'Error fetching stats: {str(e)}'}), 500


@admin_bp.route('/users', methods=['GET'])
@token_required
@role_required('admin')
def get_all_users(current_user):
    """
    Get list of all users.
    
    Query params:
        role: filter by role (optional)
        active: filter by active status (optional)
        limit: max results (default: 50)
        offset: pagination offset (default: 0)
    """
    try:
        role = request.args.get('role')
        active = request.args.get('active')
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        query = "SELECT id, username, role, full_name, email, created_at, last_login, is_active FROM users WHERE 1=1"
        params = []
        
        if role:
            query += " AND role = ?"
            params.append(role)
        
        if active is not None:
            query += " AND is_active = ?"
            params.append(1 if active.lower() == 'true' else 0)
        
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        users = execute_query(query, tuple(params))
        
        return jsonify({
            'users': users,
            'count': len(users)
        }), 200
    
    except Exception as e:
        return jsonify({'error': f'Error fetching users: {str(e)}'}), 500


@admin_bp.route('/users/<int:user_id>', methods=['GET'])
@token_required
@role_required('admin')
def get_user_details(current_user, user_id):
    """Get detailed information about a specific user."""
    try:
        user = execute_query(
            "SELECT * FROM users WHERE id = ?",
            (user_id,),
            fetch_one=True
        )
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Remove password hash from response
        user_data = dict(user)
        user_data.pop('password_hash', None)
        
        # Get user's triage statistics if patient
        if user['role'] == 'patient':
            triage_stats = execute_query("""
                SELECT 
                    COUNT(*) as total_assessments,
                    AVG(risk_score) as avg_risk,
                    MAX(assessment_date) as last_assessment
                FROM triage_results
                WHERE patient_id = ?
            """, (user_id,), fetch_one=True)
            
            user_data['triage_stats'] = triage_stats
        
        # Get doctor's review statistics if doctor
        if user['role'] == 'doctor':
            review_stats = execute_query("""
                SELECT 
                    COUNT(*) as total_reviews,
                    COUNT(CASE WHEN note_type = 'escalation' THEN 1 END) as escalations
                FROM doctor_notes
                WHERE doctor_id = ?
            """, (user_id,), fetch_one=True)
            
            user_data['review_stats'] = review_stats
        
        return jsonify({'user': user_data}), 200
    
    except Exception as e:
        return jsonify({'error': f'Error fetching user details: {str(e)}'}), 500


@admin_bp.route('/users/<int:user_id>/deactivate', methods=['POST'])
@token_required
@role_required('admin')
def deactivate_user(current_user, user_id):
    """Deactivate a user account."""
    try:
        # Cannot deactivate self
        if user_id == current_user['id']:
            return jsonify({'error': 'Cannot deactivate your own account'}), 400
        
        # Update user status
        rows_affected = execute_update(
            "UPDATE users SET is_active = 0 WHERE id = ?",
            (user_id,)
        )
        
        if rows_affected == 0:
            return jsonify({'error': 'User not found'}), 404
        
        # Log action
        log_audit(
            user_id=current_user['id'],
            action='user_deactivated',
            resource_type='user',
            resource_id=user_id
        )
        
        return jsonify({'message': 'User deactivated successfully'}), 200
    
    except Exception as e:
        return jsonify({'error': f'Error deactivating user: {str(e)}'}), 500


@admin_bp.route('/users/<int:user_id>/activate', methods=['POST'])
@token_required
@role_required('admin')
def activate_user(current_user, user_id):
    """Activate a deactivated user account."""
    try:
        rows_affected = execute_update(
            "UPDATE users SET is_active = 1 WHERE id = ?",
            (user_id,)
        )
        
        if rows_affected == 0:
            return jsonify({'error': 'User not found'}), 404
        
        log_audit(
            user_id=current_user['id'],
            action='user_activated',
            resource_type='user',
            resource_id=user_id
        )
        
        return jsonify({'message': 'User activated successfully'}), 200
    
    except Exception as e:
        return jsonify({'error': f'Error activating user: {str(e)}'}), 500


@admin_bp.route('/audit-log', methods=['GET'])
@token_required
@role_required('admin')
def get_audit_log(current_user):
    """
    Get system audit log.
    
    Query params:
        user_id: filter by user (optional)
        action: filter by action type (optional)
        limit: max results (default: 100)
        offset: pagination offset (default: 0)
    """
    try:
        user_id = request.args.get('user_id', type=int)
        action = request.args.get('action')
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        query = """
            SELECT 
                al.*,
                u.username, u.full_name
            FROM audit_log al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE 1=1
        """
        params = []
        
        if user_id:
            query += " AND al.user_id = ?"
            params.append(user_id)
        
        if action:
            query += " AND al.action = ?"
            params.append(action)
        
        query += " ORDER BY al.timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        logs = execute_query(query, tuple(params))
        
        return jsonify({
            'logs': logs,
            'count': len(logs)
        }), 200
    
    except Exception as e:
        return jsonify({'error': f'Error fetching audit log: {str(e)}'}), 500


@admin_bp.route('/triage-analytics', methods=['GET'])
@token_required
@role_required('admin', 'doctor')
def get_triage_analytics(current_user):
    """
    Get triage system analytics and trends.
    
    Query params:
        days: number of days for trend analysis (default: 30)
    """
    try:
        days = request.args.get('days', 30, type=int)
        
        analytics = {}
        
        # Triage level distribution
        level_dist = execute_query("""
            SELECT triage_level, COUNT(*) as count,
                   AVG(risk_score) as avg_risk
            FROM triage_results
            WHERE assessment_date >= datetime('now', '-' || ? || ' days')
            GROUP BY triage_level
        """, (days,))
        analytics['level_distribution'] = level_dist
        
        # Daily assessment trends
        daily_trends = execute_query("""
            SELECT DATE(assessment_date) as date,
                   COUNT(*) as assessments,
                   AVG(risk_score) as avg_risk,
                   SUM(CASE WHEN triage_level = 'Emergency' THEN 1 ELSE 0 END) as emergencies
            FROM triage_results
            WHERE assessment_date >= datetime('now', '-' || ? || ' days')
            GROUP BY DATE(assessment_date)
            ORDER BY date DESC
        """, (days,))
        analytics['daily_trends'] = daily_trends
        
        # Top risk factors
        risk_factors = execute_query("""
            SELECT 
                SUM(CASE WHEN hypertension = 1 THEN 1 ELSE 0 END) as hypertension_count,
                SUM(CASE WHEN diabetes = 1 THEN 1 ELSE 0 END) as diabetes_count,
                SUM(CASE WHEN heart_disease = 1 THEN 1 ELSE 0 END) as heart_disease_count,
                SUM(CASE WHEN smoking_status = 'current' THEN 1 ELSE 0 END) as current_smoker_count,
                AVG(bmi) as avg_bmi,
                AVG(avg_glucose_level) as avg_glucose
            FROM clinical_submissions
            WHERE submission_date >= datetime('now', '-' || ? || ' days')
        """, (days,), fetch_one=True)
        analytics['risk_factors'] = risk_factors
        
        # Review completion rate
        review_rate = execute_query("""
            SELECT 
                COUNT(*) as total_assessments,
                SUM(CASE WHEN reviewed_by_doctor IS NOT NULL THEN 1 ELSE 0 END) as reviewed,
                AVG(CASE WHEN reviewed_by_doctor IS NOT NULL 
                    THEN (julianday(review_date) - julianday(assessment_date)) * 24 
                    ELSE NULL END) as avg_review_time_hours
            FROM triage_results
            WHERE assessment_date >= datetime('now', '-' || ? || ' days')
        """, (days,), fetch_one=True)
        analytics['review_metrics'] = review_rate
        
        return jsonify({'analytics': analytics}), 200
    
    except Exception as e:
        return jsonify({'error': f'Error fetching analytics: {str(e)}'}), 500


# =====================================================
# HOSPITAL MANAGEMENT
# =====================================================

@admin_bp.route('/hospitals', methods=['GET'])
@token_required
@role_required('admin')
def get_hospitals(current_user):
    """Get all hospitals (including inactive) for admin management."""
    try:
        hospitals = execute_query("""
            SELECT h.*,
                   (SELECT COUNT(*) FROM users u 
                    WHERE u.hospital_id = h.id AND u.role = 'doctor' AND u.is_active = 1
                   ) as doctor_count
            FROM hospitals h
            ORDER BY h.is_active DESC, h.location, h.name
        """)
        
        return jsonify({'hospitals': hospitals}), 200
    
    except Exception as e:
        return jsonify({'error': f'Error fetching hospitals: {str(e)}'}), 500


@admin_bp.route('/hospitals', methods=['POST'])
@token_required
@role_required('admin')
def create_hospital(current_user):
    """
    Create a new hospital.
    
    Request body:
        {
            "name": "string",
            "location": "string",
            "address": "string" (optional),
            "phone": "string" (optional)
        }
    """
    try:
        data = request.get_json()
        
        if not data or not data.get('name') or not data.get('location'):
            return jsonify({'error': 'Hospital name and location are required'}), 400
        
        from utils.db import execute_insert
        hospital_id = execute_insert("""
            INSERT INTO hospitals (name, location, address, phone)
            VALUES (?, ?, ?, ?)
        """, (
            data['name'],
            data['location'],
            data.get('address'),
            data.get('phone')
        ))
        
        log_audit(
            user_id=current_user['id'],
            action='hospital_created',
            resource_type='hospital',
            resource_id=hospital_id
        )
        
        return jsonify({
            'message': 'Hospital created successfully',
            'hospital_id': hospital_id
        }), 201
    
    except Exception as e:
        return jsonify({'error': f'Error creating hospital: {str(e)}'}), 500


@admin_bp.route('/hospitals/<int:hospital_id>', methods=['PUT'])
@token_required
@role_required('admin')
def update_hospital(current_user, hospital_id):
    """Update hospital details."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Build dynamic update query
        fields = []
        params = []
        
        for field in ['name', 'location', 'address', 'phone']:
            if field in data:
                fields.append(f"{field} = ?")
                params.append(data[field])
        
        if not fields:
            return jsonify({'error': 'No valid fields to update'}), 400
        
        params.append(hospital_id)
        query = f"UPDATE hospitals SET {', '.join(fields)} WHERE id = ?"
        
        rows = execute_update(query, tuple(params))
        
        if rows == 0:
            return jsonify({'error': 'Hospital not found'}), 404
        
        log_audit(
            user_id=current_user['id'],
            action='hospital_updated',
            resource_type='hospital',
            resource_id=hospital_id
        )
        
        return jsonify({'message': 'Hospital updated successfully'}), 200
    
    except Exception as e:
        return jsonify({'error': f'Error updating hospital: {str(e)}'}), 500


@admin_bp.route('/hospitals/<int:hospital_id>', methods=['DELETE'])
@token_required
@role_required('admin')
def deactivate_hospital(current_user, hospital_id):
    """Deactivate a hospital (soft delete)."""
    try:
        rows = execute_update(
            "UPDATE hospitals SET is_active = 0 WHERE id = ?",
            (hospital_id,)
        )
        
        if rows == 0:
            return jsonify({'error': 'Hospital not found'}), 404
        
        log_audit(
            user_id=current_user['id'],
            action='hospital_deactivated',
            resource_type='hospital',
            resource_id=hospital_id
        )
        
        return jsonify({'message': 'Hospital deactivated successfully'}), 200
    
    except Exception as e:
        return jsonify({'error': f'Error deactivating hospital: {str(e)}'}), 500


# =====================================================
# ACCOUNT DELETION MANAGEMENT
# =====================================================

@admin_bp.route('/deletion-requests', methods=['GET'])
@token_required
@role_required('admin')
def get_deletion_requests(current_user):
    """Get all account deletion requests with user info."""
    try:
        status_filter = request.args.get('status', 'pending')

        query = """
            SELECT dr.*, u.full_name, u.email, u.role, u.username
            FROM deletion_requests dr
            JOIN users u ON dr.user_id = u.id
        """
        params = []

        if status_filter and status_filter != 'all':
            query += " WHERE dr.status = ?"
            params.append(status_filter)

        query += " ORDER BY dr.requested_at DESC"
        requests_list = execute_query(query, tuple(params))

        return jsonify({
            'deletion_requests': requests_list,
            'count': len(requests_list)
        }), 200

    except Exception as e:
        return jsonify({'error': f'Error fetching deletion requests: {str(e)}'}), 500


@admin_bp.route('/deletion-requests/<int:request_id>/approve', methods=['POST'])
@token_required
@role_required('admin')
def approve_deletion(current_user, request_id):
    """Approve a deletion request — permanently deletes the user and all related data."""
    try:
        # Get the request
        del_req = execute_query(
            "SELECT * FROM deletion_requests WHERE id = ? AND status = 'pending'",
            (request_id,),
            fetch_one=True
        )
        if not del_req:
            return jsonify({'error': 'Deletion request not found or already processed'}), 404

        user_id = del_req['user_id']

        # Prevent deleting admin accounts
        target_user = execute_query(
            "SELECT id, role, full_name FROM users WHERE id = ?",
            (user_id,),
            fetch_one=True
        )
        if not target_user:
            return jsonify({'error': 'User not found'}), 404
        if target_user['role'] == 'admin':
            return jsonify({'error': 'Cannot delete admin accounts via deletion requests'}), 400

        # Mark request as approved
        execute_update(
            "UPDATE deletion_requests SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
            (current_user['id'], request_id)
        )

        # Log before deletion
        log_audit(
            user_id=current_user['id'],
            action='deletion_approved',
            resource_type='user',
            resource_id=user_id,
            details=f"Deleted user: {target_user['full_name']} (role: {target_user['role']})"
        )

        # Delete physical audio files first
        _delete_user_audio_files(user_id)

        # Delete the user — CASCADE will remove all related data
        # (clinical_submissions, audio_records, triage_results, doctor_notes, deletion_requests)
        execute_update("PRAGMA foreign_keys = ON")
        execute_update("DELETE FROM users WHERE id = ?", (user_id,))

        return jsonify({
            'message': f"User '{target_user['full_name']}' and all related data have been permanently deleted."
        }), 200

    except Exception as e:
        return jsonify({'error': f'Error approving deletion: {str(e)}'}), 500


def _delete_user_audio_files(user_id):
    """Helper to delete all audio files associated with a user."""
    try:
        # Get all audio records for the user
        records = execute_query(
            "SELECT audio_path FROM audio_records WHERE patient_id = ?",
            (user_id,)
        )
        
        count = 0
        for record in records:
            file_path = record['audio_path']
            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    count += 1
                except Exception as e:
                    print(f"Error deleting file {file_path}: {e}")
                    
        print(f"Deleted {count} audio files for user {user_id}")
        return True
    except Exception as e:
        print(f"Error in _delete_user_audio_files: {e}")
        return False


@admin_bp.route('/deletion-requests/<int:request_id>/reject', methods=['POST'])
@token_required
@role_required('admin')
def reject_deletion(current_user, request_id):
    """Reject a deletion request with an optional note."""
    try:
        data = request.get_json() or {}
        note = data.get('note', '')

        del_req = execute_query(
            "SELECT * FROM deletion_requests WHERE id = ? AND status = 'pending'",
            (request_id,),
            fetch_one=True
        )
        if not del_req:
            return jsonify({'error': 'Deletion request not found or already processed'}), 404

        execute_update(
            "UPDATE deletion_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ? WHERE id = ?",
            (current_user['id'], note, request_id)
        )

        log_audit(
            user_id=current_user['id'],
            action='deletion_rejected',
            resource_type='user',
            resource_id=del_req['user_id'],
            details=f'Rejection note: {note}'
        )

        return jsonify({'message': 'Deletion request rejected'}), 200

    except Exception as e:
        return jsonify({'error': f'Error rejecting deletion: {str(e)}'}), 500