"""
Early Stroke Detection and Smart Clinical Triage System
Flask REST API for Clinical Decision Support System (CDSS)

Main application entry point.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.db import init_database
from routes.auth_routes import auth_bp
from routes.triage_routes import triage_bp
from routes.admin_routes import admin_bp
from routes.hospital_routes import hospital_bp
from routes.appointment_routes import appointment_bp


# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'stroke-cdss-secret-key-change-in-production')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

# Enable CORS for frontend communication
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:3000",
        ],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Initialize database
with app.app_context():
    init_database()
    print("[OK] Database initialized")

# Register blueprints (API routes)
app.register_blueprint(auth_bp)
app.register_blueprint(triage_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(hospital_bp)
app.register_blueprint(appointment_bp)


@app.route('/')
def index():
    """Root endpoint - API information."""
    return jsonify({
        'name': 'Early Stroke Detection and Smart Clinical Triage System',
        'version': '1.0.0',
        'type': 'Clinical Decision Support System (CDSS)',
        'description': 'AI-powered early warning and triage prioritization system for stroke risk assessment',
        'disclaimer': 'This is a decision support tool, NOT a diagnostic system. Clinical judgment is required for all decisions.',
        'endpoints': {
            'auth': '/api/auth',
            'triage': '/api/triage',
            'admin': '/api/admin'
        }
    })


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'database': 'connected',
        'version': '1.0.0'
    }), 200


@app.route('/api/disclaimer', methods=['GET'])
def get_disclaimer():
    """Get clinical disclaimer for the system."""
    disclaimer = {
        'title': 'Clinical Decision Support System Disclaimer',
        'content': [
            'This Early Stroke Detection and Smart Clinical Triage System is a Clinical Decision Support System (CDSS) designed to ASSIST healthcare professionals, not replace them.',
            '',
            'IMPORTANT: This system is NOT a diagnostic tool and does NOT provide medical diagnoses.',
            '',
            'Purpose:',
            '• Early warning detection for potential stroke risk',
            '• Intelligent triage prioritization for clinical workflow',
            '• Risk factor assessment and documentation',
            '',
            'This system DOES NOT replace:',
            '• Comprehensive neurological examination',
            '• Clinical judgment of qualified healthcare providers',
            '• Standard stroke assessment protocols (NIH Stroke Scale, FAST)',
            '• Neuroimaging and laboratory diagnostics',
            '• Established clinical care guidelines',
            '',
            'Limitations:',
            '• Risk scores are estimates based on available data',
            '• Audio analysis provides supplementary information only',
            '• System accuracy depends on data quality and completeness',
            '• False positives and false negatives can occur',
            '',
            'Clinical Responsibility:',
            '• All triage decisions must be reviewed by licensed medical professionals',
            '• Final clinical decisions rest with the treating physician',
            '• This system provides guidance only, not directives',
            '',
            'Emergency Protocol:',
            'In case of suspected acute stroke symptoms (sudden numbness, confusion, vision problems, difficulty walking, severe headache):',
            '• Call emergency services IMMEDIATELY (911)',
            '• Do NOT rely solely on this system for emergency decisions',
            '• Time-sensitive intervention is critical for optimal outcomes',
            '',
            'By using this system, healthcare providers acknowledge that it is a supplementary tool requiring clinical validation and professional judgment.'
        ],
        'version': '1.0',
        'last_updated': '2025-01-19'
    }
    
    return jsonify(disclaimer), 200


@app.errorhandler(400)
def bad_request(error):
    """Handle 400 errors."""
    return jsonify({'error': 'Bad request', 'message': str(error)}), 400


@app.errorhandler(401)
def unauthorized(error):
    """Handle 401 errors."""
    return jsonify({'error': 'Unauthorized', 'message': 'Authentication required'}), 401


@app.errorhandler(403)
def forbidden(error):
    """Handle 403 errors."""
    return jsonify({'error': 'Forbidden', 'message': 'Access denied'}), 403


@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({'error': 'Not found', 'message': 'Resource not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors."""
    return jsonify({'error': 'Internal server error', 'message': 'An unexpected error occurred'}), 500


@app.before_request
def log_request():
    """Log all incoming requests (for debugging)."""
    if request.method != 'OPTIONS':  # Skip OPTIONS requests (CORS preflight)
        print(f"{request.method} {request.path} - {request.remote_addr}")


if __name__ == '__main__':
    print("=" * 60)
    print("Early Stroke Detection and Smart Clinical Triage System")
    print("Clinical Decision Support System (CDSS)")
    print("=" * 60)
    print()
    print("CLINICAL DISCLAIMER:")
    print("   This is a decision support tool, NOT a diagnostic system.")
    print("   Clinical judgment is required for all medical decisions.")
    print()
    print("Starting Flask API server...")
    print("API Documentation available at: http://localhost:5000/")
    print()
    
    # Run the application
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True  # Set to False in production
    )