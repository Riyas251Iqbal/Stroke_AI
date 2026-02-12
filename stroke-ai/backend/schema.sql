-- Early Stroke Detection and Smart Clinical Triage System
-- Database Schema for Clinical Decision Support System (CDSS)

-- Users table with role-based access control
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('patient', 'doctor', 'admin')),
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    date_of_birth DATE,
    gender TEXT CHECK(gender IN ('Male', 'Female', 'Other')),
    hospital_id INTEGER,
    preferred_doctor_id INTEGER,
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
);

-- Hospitals directory
CREATE TABLE IF NOT EXISTS hospitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clinical submissions - Patient clinical data for triage assessment
CREATE TABLE IF NOT EXISTS clinical_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Demographic data (age auto-calculated from users.date_of_birth)
    age INTEGER NOT NULL,
    gender TEXT CHECK(gender IN ('Male', 'Female', 'Other')),
    
    -- Vascular risk factors
    hypertension BOOLEAN DEFAULT 0,
    heart_disease BOOLEAN DEFAULT 0,
    
    -- Metabolic factors
    diabetes BOOLEAN DEFAULT 0,
    bmi REAL,
    avg_glucose_level REAL,
    
    -- Lifestyle factors
    smoking_status TEXT CHECK(smoking_status IN ('never', 'formerly', 'current')),
    
    -- Clinical presentation
    ever_married BOOLEAN,
    work_type TEXT,
    residence_type TEXT CHECK(residence_type IN ('Urban', 'Rural')),
    
    -- Additional notes
    clinical_notes TEXT,
    
    -- Data quality tracking (Issue #2 — imputed fields)
    imputed_fields TEXT,  -- JSON array of field names that were imputed
    
    -- Temporal context (Issue #5)
    assessment_reason TEXT CHECK(assessment_reason IN ('active_symptoms', 'routine_screening', 'follow_up')),
    symptom_onset_time TIMESTAMP,
    symptoms_during_recording BOOLEAN DEFAULT 0,
    
    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Audio records - Speech analysis for early stroke detection
CREATE TABLE IF NOT EXISTS audio_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    clinical_submission_id INTEGER,
    audio_filename TEXT NOT NULL,
    audio_path TEXT NOT NULL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    recording_date TIMESTAMP,  -- Issue #9: When recording was actually made
    
    -- Audio metadata
    duration_seconds REAL,
    sample_rate INTEGER,
    
    -- Extracted audio features (JSON stored as TEXT)
    mfcc_features TEXT,  -- Mean MFCC coefficients
    prosody_features TEXT,  -- Pitch, energy, rhythm
    timing_features TEXT,  -- Speech rate, pauses
    
    -- Processing status
    processing_status TEXT DEFAULT 'pending' CHECK(processing_status IN ('pending', 'processed', 'failed')),
    processing_notes TEXT,
    
    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (clinical_submission_id) REFERENCES clinical_submissions(id) ON DELETE SET NULL
);

-- Triage results - CDSS evaluation outcomes
CREATE TABLE IF NOT EXISTS triage_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    clinical_submission_id INTEGER NOT NULL,
    audio_record_id INTEGER,
    
    -- Triage assessment
    risk_score REAL NOT NULL CHECK(risk_score >= 0 AND risk_score <= 1),
    triage_level TEXT NOT NULL CHECK(triage_level IN ('Low', 'Medium', 'High', 'Emergency')),
    confidence_score REAL CHECK(confidence_score >= 0 AND confidence_score <= 1),
    
    -- Assessment metadata (Issue #2)
    assessment_type TEXT DEFAULT 'full',
    
    -- Safety net tracking (Issue #3 audio safety net)
    safety_net_triggered BOOLEAN DEFAULT 0,
    safety_net_findings TEXT,
    
    -- Feature importance (JSON stored as TEXT)
    feature_importance TEXT,
    
    -- Clinical interpretation
    clinical_flags TEXT,  -- JSON array of concerning features
    recommendation TEXT NOT NULL,
    
    -- Timestamps
    assessment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    target_evaluation_time DATETIME,  -- Issue #4: When patient should be evaluated
    
    -- Review status (Issue #10)
    review_status TEXT DEFAULT 'pending' CHECK(
        review_status IN ('pending', 'in_progress', 'reviewed', 'needs_second_opinion', 'closed')
    ),
    reviewed_by_doctor INTEGER,
    review_date TIMESTAMP,
    assigned_to INTEGER,  -- Doctor currently working on case
    
    -- Doctor override tracking (Issue #3)
    doctor_override BOOLEAN DEFAULT 0,
    original_triage_level TEXT,
    override_reason TEXT,
    override_timestamp DATETIME,
    
    -- Low confidence flag (Issue #8)
    requires_immediate_review BOOLEAN DEFAULT 0,
    
    -- Preferred doctor (Phase 5: Hospital & Location)
    preferred_doctor_id INTEGER,
    
    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (clinical_submission_id) REFERENCES clinical_submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (audio_record_id) REFERENCES audio_records(id) ON DELETE SET NULL,
    FOREIGN KEY (reviewed_by_doctor) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (preferred_doctor_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Doctor notes - Clinical documentation and follow-up
CREATE TABLE IF NOT EXISTS doctor_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    triage_result_id INTEGER NOT NULL,
    doctor_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    
    -- Note content
    note_type TEXT CHECK(note_type IN ('review', 'follow-up', 'escalation', 'discharge')),
    note_content TEXT NOT NULL,
    
    -- Clinical actions
    action_taken TEXT,
    referral_needed BOOLEAN DEFAULT 0,
    referral_specialty TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (triage_result_id) REFERENCES triage_results(id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Audit log for system accountability
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,  -- Snapshot for traceability (Issue #14)
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    details TEXT,
    -- Structured change tracking (Issue #14)
    before_value TEXT,  -- JSON: state before change
    after_value TEXT,   -- JSON: state after change
    change_reason TEXT,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Account deletion requests
CREATE TABLE IF NOT EXISTS deletion_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_by INTEGER,
    reviewed_at TIMESTAMP,
    review_note TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Appointments - Triage-based scheduling
CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    doctor_id INTEGER NOT NULL,
    triage_result_id INTEGER,

    -- Scheduling
    appointment_date TEXT NOT NULL,      -- YYYY-MM-DD
    appointment_time TEXT NOT NULL,      -- HH:MM
    duration_minutes INTEGER DEFAULT 30,

    -- Classification
    appointment_type TEXT DEFAULT 'follow_up' CHECK(
        appointment_type IN ('follow_up', 'urgent', 'routine', 'consultation')
    ),
    priority TEXT DEFAULT 'normal' CHECK(
        priority IN ('critical', 'high', 'normal', 'low')
    ),
    status TEXT DEFAULT 'scheduled' CHECK(
        status IN ('scheduled', 'completed', 'cancelled', 'no_show')
    ),

    -- Details
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (triage_result_id) REFERENCES triage_results(id) ON DELETE SET NULL
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_clinical_submissions_patient ON clinical_submissions(patient_id);
CREATE INDEX IF NOT EXISTS idx_audio_records_patient ON audio_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_triage_results_patient ON triage_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_triage_results_level ON triage_results(triage_level);
CREATE INDEX IF NOT EXISTS idx_doctor_notes_doctor ON doctor_notes(doctor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);

CREATE INDEX IF NOT EXISTS idx_hospitals_location ON hospitals(location);
CREATE INDEX IF NOT EXISTS idx_hospitals_active ON hospitals(is_active);
CREATE INDEX IF NOT EXISTS idx_users_hospital ON users(hospital_id);
CREATE INDEX IF NOT EXISTS idx_triage_preferred_doctor ON triage_results(preferred_doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- Insert default admin user (password: admin123 - CHANGE IN PRODUCTION)
INSERT OR IGNORE INTO users (username, password_hash, role, full_name, email) 
VALUES ('admin', 'scrypt:32768:8:1$DrPxK5rlG2zounTA$b0eedd0c61c77f06c1e8e3fee4f92482ea7e6eb9d0090f04074318bbef4e9d2d9223fac956e84c1ee797af912cbf60697a2f7a7fe', 'admin', 'System Administrator', 'admin@stroketriage.health');