"""
Hospital Routes
API endpoints for hospital and doctor location management.
Public endpoints for listing hospitals and finding nearby doctors.
"""

from flask import Blueprint, request, jsonify
from utils.db import execute_query

hospital_bp = Blueprint('hospital', __name__, url_prefix='/api/hospitals')


@hospital_bp.route('', methods=['GET'])
def get_hospitals():
    """
    Get list of active hospitals. (Public - no auth required)
    
    Query params:
        location: filter by location/area (optional)
    
    Returns:
        List of hospitals with doctor counts
    """
    try:
        location = request.args.get('location', '').strip()
        
        if location:
            hospitals = execute_query("""
                SELECT h.*, 
                       (SELECT COUNT(*) FROM users u 
                        WHERE u.hospital_id = h.id AND u.role = 'doctor' AND u.is_active = 1
                       ) as doctor_count
                FROM hospitals h
                WHERE h.is_active = 1 AND h.location LIKE ?
                ORDER BY h.name
            """, (f'%{location}%',))
        else:
            hospitals = execute_query("""
                SELECT h.*,
                       (SELECT COUNT(*) FROM users u 
                        WHERE u.hospital_id = h.id AND u.role = 'doctor' AND u.is_active = 1
                       ) as doctor_count
                FROM hospitals h
                WHERE h.is_active = 1
                ORDER BY h.location, h.name
            """)
        
        return jsonify({'hospitals': hospitals}), 200
    
    except Exception as e:
        return jsonify({'error': f'Error fetching hospitals: {str(e)}'}), 500


@hospital_bp.route('/locations', methods=['GET'])
def get_locations():
    """
    Get distinct locations that have active hospitals. (Public - no auth required)
    Used for location dropdown on patient side.
    """
    try:
        locations = execute_query("""
            SELECT DISTINCT location 
            FROM hospitals 
            WHERE is_active = 1
            ORDER BY location
        """)
        
        location_list = [loc['location'] for loc in locations]
        return jsonify({'locations': location_list}), 200
    
    except Exception as e:
        return jsonify({'error': f'Error fetching locations: {str(e)}'}), 500


@hospital_bp.route('/<int:hospital_id>/doctors', methods=['GET'])
def get_hospital_doctors(hospital_id):
    """
    Get list of active doctors at a specific hospital. (Public - no auth required)
    """
    try:
        doctors = execute_query("""
            SELECT u.id, u.full_name, u.email, u.phone
            FROM users u
            WHERE u.hospital_id = ? AND u.role = 'doctor' AND u.is_active = 1
            ORDER BY u.full_name
        """, (hospital_id,))
        
        hospital = execute_query("""
            SELECT id, name, location, address, phone
            FROM hospitals WHERE id = ? AND is_active = 1
        """, (hospital_id,), fetch_one=True)
        
        if not hospital:
            return jsonify({'error': 'Hospital not found'}), 404
        
        return jsonify({
            'hospital': hospital,
            'doctors': doctors
        }), 200
    
    except Exception as e:
        return jsonify({'error': f'Error fetching doctors: {str(e)}'}), 500


@hospital_bp.route('/nearby-doctors', methods=['GET'])
def get_nearby_doctors():
    """
    Get doctors grouped by hospital for a given location. (Public - no auth required)
    
    Query params:
        location: area/city to search
    """
    try:
        location = request.args.get('location', '').strip()
        
        if not location:
            return jsonify({'error': 'Location parameter required'}), 400
        
        # Get hospitals in this location with their doctors
        hospitals = execute_query("""
            SELECT h.id, h.name, h.location, h.address, h.phone
            FROM hospitals h
            WHERE h.is_active = 1 AND h.location LIKE ?
            ORDER BY h.name
        """, (f'%{location}%',))
        
        result = []
        for hospital in hospitals:
            doctors = execute_query("""
                SELECT u.id, u.full_name, u.email, u.phone
                FROM users u
                WHERE u.hospital_id = ? AND u.role = 'doctor' AND u.is_active = 1
                ORDER BY u.full_name
            """, (hospital['id'],))
            
            result.append({
                'hospital': hospital,
                'doctors': doctors
            })
        
        return jsonify({'nearby': result}), 200
    
    except Exception as e:
        return jsonify({'error': f'Error fetching nearby doctors: {str(e)}'}), 500


@hospital_bp.route('/request', methods=['POST'])
def submit_hospital_request():
    """
    Submit a new hospital request (during doctor registration).
    Hospital will be pending until admin approves it.
    
    Request body:
        {
            "name": "string",
            "location": "string",
            "address": "string" (optional),
            "phone": "string" (optional),
            "submitted_by": int (optional, user_id of the doctor)
        }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        if not data.get('name') or not data.get('location'):
            return jsonify({'error': 'Hospital name and location are required'}), 400
        
        # Check for duplicate pending requests
        existing = execute_query("""
            SELECT id FROM pending_hospitals 
            WHERE LOWER(name) = LOWER(?) AND LOWER(location) = LOWER(?) AND status = 'pending'
        """, (data['name'], data['location']), fetch_one=True)
        
        if existing:
            return jsonify({'error': 'A request for this hospital is already pending'}), 409
        
        # Also check if hospital already exists in active list
        active = execute_query("""
            SELECT id FROM hospitals 
            WHERE LOWER(name) = LOWER(?) AND LOWER(location) = LOWER(?) AND is_active = 1
        """, (data['name'], data['location']), fetch_one=True)
        
        if active:
            return jsonify({
                'error': 'This hospital already exists',
                'hospital_id': active['id']
            }), 409
        
        from utils.db import execute_update
        pending_id = execute_update("""
            INSERT INTO pending_hospitals (name, location, address, phone, submitted_by)
            VALUES (?, ?, ?, ?, ?)
        """, (
            data['name'],
            data['location'],
            data.get('address', ''),
            data.get('phone', ''),
            data.get('submitted_by')
        ))
        
        return jsonify({
            'message': 'Hospital request submitted successfully. It will be available after admin approval.',
            'pending_hospital_id': pending_id
        }), 201
    
    except Exception as e:
        return jsonify({'error': f'Error submitting hospital request: {str(e)}'}), 500

