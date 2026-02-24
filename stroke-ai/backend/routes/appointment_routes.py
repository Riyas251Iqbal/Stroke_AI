"""
Appointment Routes
Triage-based appointment scheduling for doctors and patients.
"""

from flask import Blueprint, request, jsonify
from services.auth_service import token_required
from utils.db import execute_query, execute_insert, execute_update

appointment_bp = Blueprint('appointments', __name__, url_prefix='/api/appointments')


# ─── Priority mapping from triage level ──────────────────────────
TRIAGE_TO_PRIORITY = {
    'Emergency': 'critical',
    'High': 'high',
    'Medium': 'normal',
    'Low': 'low',
}

TRIAGE_TO_TYPE = {
    'Emergency': 'urgent',
    'High': 'follow_up',
    'Medium': 'follow_up',
    'Low': 'routine',
}


@appointment_bp.route('', methods=['POST'])
@token_required
def create_appointment(current_user):
    """Create an appointment (doctor only)."""
    if current_user['role'] not in ('doctor', 'admin'):
        return jsonify({'error': 'Only doctors can schedule appointments'}), 403

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400

    patient_id = data.get('patient_id')
    appointment_date = data.get('appointment_date')
    appointment_time = data.get('appointment_time')

    if not all([patient_id, appointment_date, appointment_time]):
        return jsonify({'error': 'patient_id, appointment_date, and appointment_time are required'}), 400

    triage_result_id = data.get('triage_result_id')
    appointment_type = data.get('appointment_type', 'follow_up')
    priority = data.get('priority', 'normal')
    duration = data.get('duration_minutes', 30)
    notes = data.get('notes', '')

    # Auto-derive priority from triage if linked
    if triage_result_id:
        triage = execute_query(
            "SELECT triage_level FROM triage_results WHERE id = ?",
            (triage_result_id,)
        )
        if triage:
            level = triage[0]['triage_level']
            priority = TRIAGE_TO_PRIORITY.get(level, priority)
            if appointment_type == 'follow_up':
                appointment_type = TRIAGE_TO_TYPE.get(level, appointment_type)

    appointment_id = execute_insert(
        """INSERT INTO appointments
           (patient_id, doctor_id, triage_result_id, appointment_date,
            appointment_time, duration_minutes, appointment_type, priority, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)""",
        (patient_id, current_user['id'], triage_result_id,
         appointment_date, appointment_time, duration,
         appointment_type, priority, notes)
    )

    if not appointment_id:
        return jsonify({'error': 'Failed to create appointment'}), 500

    return jsonify({
        'message': 'Appointment scheduled successfully',
        'appointment_id': appointment_id
    }), 201


@appointment_bp.route('', methods=['GET'])
@token_required
def list_appointments(current_user):
    """List appointments. Doctors see their patients, patients see their own."""
    status_filter = request.args.get('status', 'scheduled')

    if current_user['role'] == 'patient':
        query = """
            SELECT a.*, u.full_name as doctor_name
            FROM appointments a
            JOIN users u ON a.doctor_id = u.id
            WHERE a.patient_id = ?
        """
        params = [current_user['id']]
    elif current_user['role'] in ('doctor', 'admin'):
        query = """
            SELECT a.*, u.full_name as patient_name
            FROM appointments a
            JOIN users u ON a.patient_id = u.id
            WHERE a.doctor_id = ?
        """
        params = [current_user['id']]
    else:
        return jsonify({'error': 'Access denied'}), 403

    if status_filter and status_filter != 'all':
        query += " AND a.status = ?"
        params.append(status_filter)

    query += " ORDER BY a.appointment_date ASC, a.appointment_time ASC"

    appointments = execute_query(query, tuple(params))
    return jsonify({'appointments': appointments or []}), 200


@appointment_bp.route('/<int:appointment_id>', methods=['PUT'])
@token_required
def update_appointment(current_user, appointment_id):
    """Update appointment (doctor only)."""
    if current_user['role'] not in ('doctor', 'admin'):
        return jsonify({'error': 'Only doctors can update appointments'}), 403

    # Verify the doctor owns this appointment
    appt = execute_query(
        "SELECT * FROM appointments WHERE id = ? AND doctor_id = ?",
        (appointment_id, current_user['id'])
    )
    if not appt:
        return jsonify({'error': 'Appointment not found'}), 404

    data = request.get_json()
    fields = []
    values = []

    for field in ['appointment_date', 'appointment_time', 'duration_minutes',
                  'appointment_type', 'priority', 'status', 'notes']:
        if field in data:
            fields.append(f"{field} = ?")
            values.append(data[field])

    if not fields:
        return jsonify({'error': 'No fields to update'}), 400

    fields.append("updated_at = CURRENT_TIMESTAMP")
    values.append(appointment_id)

    success = execute_update(
        f"UPDATE appointments SET {', '.join(fields)} WHERE id = ?",
        tuple(values)
    )

    return jsonify({'message': 'Appointment updated' if success else 'Update failed'}), (200 if success else 500)


@appointment_bp.route('/<int:appointment_id>/cancel', methods=['POST'])
@token_required
def cancel_appointment(current_user, appointment_id):
    """Cancel an appointment (doctor or patient)."""
    # Verify access
    if current_user['role'] == 'patient':
        appt = execute_query(
            "SELECT * FROM appointments WHERE id = ? AND patient_id = ?",
            (appointment_id, current_user['id'])
        )
    else:
        appt = execute_query(
            "SELECT * FROM appointments WHERE id = ? AND doctor_id = ?",
            (appointment_id, current_user['id'])
        )

    if not appt:
        return jsonify({'error': 'Appointment not found'}), 404

    if appt[0]['status'] == 'cancelled':
        return jsonify({'error': 'Appointment is already cancelled'}), 400

    success = execute_update(
        "UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (appointment_id,)
    )

    return jsonify({'message': 'Appointment cancelled' if success else 'Cancel failed'}), (200 if success else 500)
