"""
Database Utilities for Clinical Decision Support System
Handles SQLite database initialization and connection management
"""

import sqlite3
import os
from contextlib import contextmanager
from typing import Optional, Dict, List, Any

# Database configuration
DATABASE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database.db')
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'schema.sql')


def init_database() -> None:
    """
    Initialize the database with schema if it doesn't exist.
    Creates all tables and indexes for the CDSS system.
    """
    if not os.path.exists(DATABASE_PATH):
        print("Initializing database for Clinical Decision Support System...")
        
    conn = sqlite3.connect(DATABASE_PATH)
    
    try:
        # Check if users table exists to avoid locking database unnecessarily
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        if cursor.fetchone():
            # Database already initialized — run migrations only
            _run_migrations(conn)
            return

        with open(SCHEMA_PATH, 'r') as f:
            schema_sql = f.read()
        
        conn.executescript(schema_sql)
        conn.commit()
        print("[OK] Database initialized successfully")
    except Exception as e:
        # Check if it's just a locked error and tables might already exist
        if "locked" in str(e):
            print(f"[WARNING] Database locked during initialization. Assuming already initialized.")
        else:
            print(f"[ERROR] Database initialization failed: {str(e)}")
            raise
    finally:
        conn.close()


def _run_migrations(conn) -> None:
    """
    Run incremental migrations for schema changes on existing databases.
    Each migration checks if it's already been applied before executing.
    """
    cursor = conn.cursor()
    
    # Migration 1: Add video_records table
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='video_records'")
    if not cursor.fetchone():
        print("  [MIGRATION] Creating video_records table...")
        cursor.executescript("""
            CREATE TABLE IF NOT EXISTS video_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                clinical_submission_id INTEGER,
                video_filename TEXT NOT NULL,
                video_path TEXT NOT NULL,
                upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                risk_score REAL,
                severity TEXT,
                region_scores TEXT,
                region_labels TEXT,
                region_confidences TEXT,
                confidence REAL,
                processing_status TEXT DEFAULT 'pending',
                processing_notes TEXT,
                FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (clinical_submission_id) REFERENCES clinical_submissions(id) ON DELETE SET NULL
            );
        """)
        print("  [OK] video_records table created")
    
    # Migration 2: Add video columns to triage_results
    cursor.execute("PRAGMA table_info(triage_results)")
    existing_cols = {row[1] for row in cursor.fetchall()}
    
    if 'video_record_id' not in existing_cols:
        print("  [MIGRATION] Adding video columns to triage_results...")
        cursor.execute("ALTER TABLE triage_results ADD COLUMN video_record_id INTEGER")
        cursor.execute("ALTER TABLE triage_results ADD COLUMN video_severity TEXT")
        cursor.execute("ALTER TABLE triage_results ADD COLUMN video_region_details TEXT")
        print("  [OK] video columns added to triage_results")
    
    # Migration 3: Add audio_model_features to audio_records
    cursor.execute("PRAGMA table_info(audio_records)")
    audio_cols = {row[1] for row in cursor.fetchall()}
    
    if 'audio_model_features' not in audio_cols:
        print("  [MIGRATION] Adding audio_model_features to audio_records...")
        cursor.execute("ALTER TABLE audio_records ADD COLUMN audio_model_features TEXT")
        print("  [OK] audio_model_features column added")
    
    conn.commit()


@contextmanager
def get_db_connection():
    """
    Context manager for database connections.
    Ensures proper connection handling and automatic cleanup.
    
    Usage:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users")
    """
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row  # Access columns by name
    try:
        yield conn
    finally:
        conn.close()


def execute_query(query: str, params: tuple = (), fetch_one: bool = False) -> Optional[Any]:
    """
    Execute a SELECT query and return results.
    
    Args:
        query: SQL query string
        params: Query parameters (use ? placeholders)
        fetch_one: If True, return single row; otherwise return all rows
    
    Returns:
        Single row dict, list of row dicts, or None
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        
        if fetch_one:
            row = cursor.fetchone()
            return dict(row) if row else None
        else:
            rows = cursor.fetchall()
            return [dict(row) for row in rows]


def execute_insert(query: str, params: tuple = ()) -> int:
    """
    Execute an INSERT query and return the last inserted row ID.
    
    Args:
        query: SQL INSERT statement
        params: Query parameters
    
    Returns:
        Last inserted row ID
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        conn.commit()
        return cursor.lastrowid


def execute_update(query: str, params: tuple = ()) -> int:
    """
    Execute an UPDATE or DELETE query and return affected row count.
    
    Args:
        query: SQL UPDATE/DELETE statement
        params: Query parameters
    
    Returns:
        Number of affected rows
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        conn.commit()
        return cursor.rowcount


def get_user_by_username(username: str) -> Optional[Dict]:
    """Retrieve user by username for authentication."""
    query = "SELECT * FROM users WHERE username = ? AND is_active = 1"
    return execute_query(query, (username,), fetch_one=True)


def get_user_by_id(user_id: int) -> Optional[Dict]:
    """Retrieve user by ID."""
    query = "SELECT * FROM users WHERE id = ? AND is_active = 1"
    return execute_query(query, (user_id,), fetch_one=True)

def get_user_by_email(email: str) -> Optional[Dict]:
    """Retrieve user by email."""
    query = "SELECT * FROM users WHERE email = ?"
    return execute_query(query, (email,), fetch_one=True)


def get_user_by_username_all(username: str) -> Optional[Dict]:
    """Retrieve user by username, including inactive ones."""
    query = "SELECT * FROM users WHERE username = ?"
    return execute_query(query, (username,), fetch_one=True)


def create_user(username: str, password_hash: str, role: str, 
                full_name: str, email: str, **kwargs) -> int:
    """
    Create a new user in the system.
    
    Args:
        username: Unique username
        password_hash: Hashed password
        role: User role (patient, doctor, admin)
        full_name: User's full name
        email: User's email address
        **kwargs: Additional fields (phone, date_of_birth)
    
    Returns:
        New user ID
    """
    query = """
        INSERT INTO users (username, password_hash, role, full_name, email, phone, date_of_birth, gender, hospital_id, preferred_doctor_id, address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    params = (
        username, 
        password_hash, 
        role, 
        full_name, 
        email,
        kwargs.get('phone'),
        kwargs.get('date_of_birth'),
        kwargs.get('gender'),
        kwargs.get('hospital_id'),
        kwargs.get('preferred_doctor_id'),
        kwargs.get('address')
    )
    return execute_insert(query, params)


def log_audit(user_id: Optional[int], action: str, resource_type: Optional[str] = None,
              resource_id: Optional[int] = None, ip_address: Optional[str] = None,
              details: Optional[str] = None) -> int:
    """
    Log system actions for accountability and security.
    
    Args:
        user_id: User performing the action
        action: Action description
        resource_type: Type of resource accessed
        resource_id: ID of resource accessed
        ip_address: User's IP address
        details: Additional details (JSON string)
    
    Returns:
        Audit log entry ID
    """
    query = """
        INSERT INTO audit_log (user_id, action, resource_type, resource_id, ip_address, details)
        VALUES (?, ?, ?, ?, ?, ?)
    """
    return execute_insert(query, (user_id, action, resource_type, resource_id, ip_address, details))


def get_patient_triage_history(patient_id: int, limit: int = 10) -> List[Dict]:
    """
    Retrieve patient's triage assessment history.
    
    Args:
        patient_id: Patient's user ID
        limit: Maximum number of results
    
    Returns:
        List of triage results with clinical data
    """
    query = """
        SELECT 
            tr.*,
            cs.age, cs.hypertension, cs.diabetes, cs.bmi,
            ar.audio_filename,
            u.full_name as reviewed_by_name
        FROM triage_results tr
        JOIN clinical_submissions cs ON tr.clinical_submission_id = cs.id
        LEFT JOIN audio_records ar ON tr.audio_record_id = ar.id
        LEFT JOIN users u ON tr.reviewed_by_doctor = u.id
        WHERE tr.patient_id = ?
        ORDER BY tr.assessment_date DESC
        LIMIT ?
    """
    return execute_query(query, (patient_id, limit))


def get_pending_triage_cases(triage_level: Optional[str] = None) -> List[Dict]:
    """
    Retrieve triage cases pending doctor review.
    
    Args:
        triage_level: Filter by triage level (Low, Medium, Emergency)
    
    Returns:
        List of pending triage cases
    """
    if triage_level:
        query = """
            SELECT 
                tr.*,
                u.full_name as patient_name,
                u.email as patient_email,
                cs.age, cs.hypertension, cs.diabetes
            FROM triage_results tr
            JOIN users u ON tr.patient_id = u.id
            JOIN clinical_submissions cs ON tr.clinical_submission_id = cs.id
            WHERE tr.reviewed_by_doctor IS NULL 
            AND tr.triage_level = ?
            ORDER BY tr.assessment_date ASC
        """
        return execute_query(query, (triage_level,))
    else:
        query = """
            SELECT 
                tr.*,
                u.full_name as patient_name,
                u.email as patient_email,
                cs.age, cs.hypertension, cs.diabetes
            FROM triage_results tr
            JOIN users u ON tr.patient_id = u.id
            JOIN clinical_submissions cs ON tr.clinical_submission_id = cs.id
            WHERE tr.reviewed_by_doctor IS NULL
            ORDER BY 
                CASE tr.triage_level
                    WHEN 'Emergency' THEN 1
                    WHEN 'Medium' THEN 2
                    WHEN 'Low' THEN 3
                END,
                tr.assessment_date ASC
        """
        return execute_query(query)


# Initialize database on module import
if __name__ == "__main__":
    init_database()