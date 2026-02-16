"""
Authentication Routes
API endpoints for user authentication, registration, and profile management.
"""

from flask import Blueprint, request, jsonify
from services.auth_service import AuthService, PasswordResetService, token_required
from utils.db import log_audit


auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@auth_bp.route('/register', methods=['POST'])
def register():
    """
    Register a new user.
    
    Request body:
        {
            "username": "string",
            "password": "string",
            "role": "patient|doctor|admin",
            "full_name": "string",
            "email": "string",
            "phone": "string" (optional),
            "date_of_birth": "YYYY-MM-DD" (optional)
        }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        # Validate required fields
        required = ['username', 'password', 'role', 'full_name', 'email']
        missing = [field for field in required if field not in data]
        if missing:
            return jsonify({'error': f"Missing required fields: {', '.join(missing)}"}), 400
        
        # Register user
        success, message, user_data = AuthService.register_user(
            username=data['username'],
            password=data['password'],
            role=data['role'],
            full_name=data['full_name'],
            email=data['email'],
            phone=data.get('phone'),
            date_of_birth=data.get('date_of_birth'),
            gender=data.get('gender'),
            hospital_id=data.get('hospital_id'),
            preferred_doctor_id=data.get('preferred_doctor_id'),
            address=data.get('address')
        )
        
        if success:
            return jsonify({
                'message': message,
                'user': user_data
            }), 201
        else:
            return jsonify({'error': message}), 400
    
    except Exception as e:
        return jsonify({'error': f'Registration error: {str(e)}'}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Authenticate user and receive JWT token.
    
    Request body:
        {
            "username": "string",
            "password": "string"
        }
    
    Response:
        {
            "message": "Login successful",
            "auth": {
                "token": "JWT token",
                "user_id": int,
                "username": "string",
                "role": "string",
                "full_name": "string",
                "email": "string"
            }
        }
    """
    try:
        data = request.get_json()
        
        # Validate credentials provided
        if 'username' not in data or 'password' not in data:
            return jsonify({'error': 'Username and password required'}), 400
        
        # Get IP address for audit log
        ip_address = request.remote_addr
        
        # Attempt login
        success, message, auth_data = AuthService.login_user(
            username=data['username'],
            password=data['password'],
            ip_address=ip_address
        )
        
        if success:
            return jsonify({
                'message': message,
                'auth': auth_data
            }), 200
        else:
            return jsonify({'error': message}), 401
    
    except Exception as e:
        return jsonify({'error': f'Login error: {str(e)}'}), 500


@auth_bp.route('/profile', methods=['GET'])
@token_required
def get_profile(current_user):
    """
    Get current user's profile.
    Requires authentication token.
    """
    try:
        profile_data = {
            'id': current_user['id'],
            'username': current_user['username'],
            'role': current_user['role'],
            'full_name': current_user['full_name'],
            'email': current_user['email'],
            'phone': current_user.get('phone'),
            'date_of_birth': current_user.get('date_of_birth'),
            'created_at': current_user['created_at'],
            'last_login': current_user['last_login']
        }
        
        return jsonify({'profile': profile_data}), 200
    
    except Exception as e:
        return jsonify({'error': f'Error fetching profile: {str(e)}'}), 500


@auth_bp.route('/change-password', methods=['POST'])
@token_required
def change_password(current_user):
    """
    Change user password.
    
    Request body:
        {
            "old_password": "string",
            "new_password": "string"
        }
    """
    try:
        data = request.get_json()
        
        if 'old_password' not in data or 'new_password' not in data:
            return jsonify({'error': 'Old and new passwords required'}), 400
        
        success, message = PasswordResetService.change_password(
            user_id=current_user['id'],
            old_password=data['old_password'],
            new_password=data['new_password']
        )
        
        if success:
            return jsonify({'message': message}), 200
        else:
            return jsonify({'error': message}), 400
    
    except Exception as e:
        return jsonify({'error': f'Password change error: {str(e)}'}), 500


@auth_bp.route('/verify', methods=['GET'])
@token_required
def verify_token(current_user):
    """
    Verify that authentication token is valid.
    Returns current user info.
    """
    return jsonify({
        'valid': True,
        'user': {
            'id': current_user['id'],
            'username': current_user['username'],
            'role': current_user['role'],
            'full_name': current_user['full_name']
        }
    }), 200


@auth_bp.route('/logout', methods=['POST'])
@token_required
def logout(current_user):
    """
    Logout user (log the action).
    Note: JWT tokens remain valid until expiration.
    Client should discard the token.
    """
    try:
        log_audit(
            user_id=current_user['id'],
            action='logout',
            ip_address=request.remote_addr
        )
        
        return jsonify({'message': 'Logged out successfully'}), 200
    
    except Exception as e:
        return jsonify({'error': f'Logout error: {str(e)}'}), 500