"""
Authentication Service
Handles user authentication, authorization, and session management
for the Clinical Decision Support System.
"""

from werkzeug.security import generate_password_hash, check_password_hash
from typing import Optional, Dict, Tuple
import jwt
import os
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify

from utils.db import (
    get_user_by_username, 
    get_user_by_username_all,
    get_user_by_email, 
    get_user_by_id, 
    create_user,
    execute_update,
    log_audit
)
from utils.helpers import validate_date_of_birth


# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'stroke-cdss-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24


class AuthService:
    """
    Authentication and authorization service for CDSS.
    Manages user login, registration, and role-based access control.
    """
    
    @staticmethod
    def register_user(username: str, password: str, role: str,
                     full_name: str, email: str, **kwargs) -> Tuple[bool, str, Optional[Dict]]:
        """
        Register a new user in the system.
        
        Args:
            username: Unique username
            password: Plain text password (will be hashed)
            role: User role (patient, doctor, admin)
            full_name: User's full name
            email: User's email address
            **kwargs: Additional fields (phone, date_of_birth, emergency_contact)
        
        Returns:
            Tuple of (success, message, user_data)
        """
        # Validate role
        valid_roles = ['patient', 'doctor', 'admin']
        if role not in valid_roles:
            return False, f"Invalid role. Must be one of: {', '.join(valid_roles)}", None
        
        # ERROR 1 FIX: Validate date_of_birth for patients
        if role == 'patient':
            date_of_birth = kwargs.get('date_of_birth')
            if not date_of_birth:
                return False, "Date of birth is required for patient registration", None
            
            try:
                validate_date_of_birth(date_of_birth)
            except ValueError as e:
                return False, str(e), None
        
        # Check if username already exists (including inactive users to prevent collisions)
        existing_username = get_user_by_username_all(username)
        if existing_username:
            if not existing_username['is_active']:
                return False, "This username belongs to a deactivated account. Please contact administrator.", None
            return False, "Username already exists", None
        
        # Check if email already exists
        existing_email = get_user_by_email(email)
        if existing_email:
            return False, "Email address is already registered", None
        
        # Validate password strength
        if len(password) < 6:
            return False, "Password must be at least 6 characters", None
        
        # Hash password
        password_hash = generate_password_hash(password)
        
        try:
            # Create user
            user_id = create_user(
                username=username,
                password_hash=password_hash,
                role=role,
                full_name=full_name,
                email=email,
                **kwargs
            )
            
            # Log registration
            log_audit(
                user_id=user_id,
                action='user_registered',
                resource_type='user',
                resource_id=user_id,
                details=f"New {role} account created"
            )
            
            # Get created user
            user = get_user_by_id(user_id)
            user_data = {
                'id': user['id'],
                'username': user['username'],
                'role': user['role'],
                'full_name': user['full_name'],
                'email': user['email'],
                'gender': user.get('gender')
            }
            
            return True, "User registered successfully", user_data
        
        except Exception as e:
            return False, f"Registration failed: {str(e)}", None
    
    @staticmethod
    def login_user(username: str, password: str, 
                   ip_address: Optional[str] = None) -> Tuple[bool, str, Optional[Dict]]:
        """
        Authenticate user and generate JWT token.
        
        Args:
            username: Username
            password: Plain text password
            ip_address: User's IP address for logging
        
        Returns:
            Tuple of (success, message, auth_data)
            auth_data contains: token, user_id, username, role, full_name
        """
        # Get user
        user = get_user_by_username(username)
        
        if not user:
            log_audit(
                user_id=None,
                action='login_failed',
                ip_address=ip_address,
                details=f"Invalid username: {username}"
            )
            return False, "Invalid username or password", None
        
        # Check password
        if not check_password_hash(user['password_hash'], password):
            log_audit(
                user_id=user['id'],
                action='login_failed',
                ip_address=ip_address,
                details="Invalid password attempt"
            )
            return False, "Invalid username or password", None
        
        # Check if account is active
        if not user['is_active']:
            log_audit(
                user_id=user['id'],
                action='login_failed',
                ip_address=ip_address,
                details="Inactive account login attempt"
            )
            return False, "Account is inactive. Contact administrator.", None
        
        # Generate JWT token
        token = AuthService._generate_token(user)
        
        # Update last login
        execute_update(
            "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?",
            (user['id'],)
        )
        
        # Log successful login
        log_audit(
            user_id=user['id'],
            action='login_success',
            ip_address=ip_address,
            details=f"User logged in as {user['role']}"
        )
        
        auth_data = {
            'token': token,
            'user_id': user['id'],
            'username': user['username'],
            'role': user['role'],
            'full_name': user['full_name'],
            'email': user['email'],
            'gender': user.get('gender')
        }
        
        return True, "Login successful", auth_data
    
    @staticmethod
    def _generate_token(user: Dict) -> str:
        """
        Generate JWT token for authenticated user.
        
        Args:
            user: User dictionary
        
        Returns:
            JWT token string
        """
        payload = {
            'user_id': user['id'],
            'username': user['username'],
            'role': user['role'],
            'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
            'iat': datetime.utcnow()
        }
        
        token = jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)
        return token
    
    @staticmethod
    def verify_token(token: str) -> Tuple[bool, Optional[Dict]]:
        """
        Verify and decode JWT token.
        
        Args:
            token: JWT token string
        
        Returns:
            Tuple of (valid, payload)
        """
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
            return True, payload
        except jwt.ExpiredSignatureError:
            return False, None
        except jwt.InvalidTokenError:
            return False, None
    
    @staticmethod
    def get_current_user(token: str) -> Optional[Dict]:
        """
        Get current user from token.
        
        Args:
            token: JWT token
        
        Returns:
            User dictionary or None
        """
        valid, payload = AuthService.verify_token(token)
        if not valid:
            return None
        
        user = get_user_by_id(payload['user_id'])
        return user


# Decorator for protected routes
def token_required(f):
    """
    Decorator to protect routes requiring authentication.
    
    Usage:
        @app.route('/protected')
        @token_required
        def protected_route(current_user):
            return jsonify({'message': f'Hello {current_user["username"]}'})
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Get token from Authorization header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(' ')[1]  # Bearer <token>
            except IndexError:
                return jsonify({'error': 'Invalid token format'}), 401
        
        if not token:
            return jsonify({'error': 'Authentication token required'}), 401
        
        # Verify token
        valid, payload = AuthService.verify_token(token)
        if not valid:
            return jsonify({'error': 'Invalid or expired token'}), 401
        
        # Get current user
        current_user = get_user_by_id(payload['user_id'])
        if not current_user or not current_user['is_active']:
            return jsonify({'error': 'User not found or inactive'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated


def role_required(*allowed_roles):
    """
    Decorator to restrict routes to specific user roles.
    
    Usage:
        @app.route('/doctor-only')
        @token_required
        @role_required('doctor', 'admin')
        def doctor_route(current_user):
            return jsonify({'message': 'Doctor access granted'})
    """
    def decorator(f):
        @wraps(f)
        def decorated(current_user, *args, **kwargs):
            if current_user['role'] not in allowed_roles:
                return jsonify({
                    'error': f'Access denied. Required roles: {", ".join(allowed_roles)}'
                }), 403
            
            return f(current_user, *args, **kwargs)
        
        return decorated
    return decorator


# Password reset functionality
class PasswordResetService:
    """Handle password reset operations."""
    
    @staticmethod
    def change_password(user_id: int, old_password: str, 
                       new_password: str) -> Tuple[bool, str]:
        """
        Change user password.
        
        Args:
            user_id: User ID
            old_password: Current password
            new_password: New password
        
        Returns:
            Tuple of (success, message)
        """
        user = get_user_by_id(user_id)
        if not user:
            return False, "User not found"
        
        # Verify old password
        if not check_password_hash(user['password_hash'], old_password):
            return False, "Current password is incorrect"
        
        # Validate new password
        if len(new_password) < 6:
            return False, "New password must be at least 6 characters"
        
        # Hash new password
        new_password_hash = generate_password_hash(new_password)
        
        # Update password
        execute_update(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (new_password_hash, user_id)
        )
        
        # Log password change
        log_audit(
            user_id=user_id,
            action='password_changed',
            resource_type='user',
            resource_id=user_id
        )
        
        return True, "Password changed successfully"