-- Migration 001: Add columns for critical error fixes
-- Fixes: ERROR 1, 4, 5, 6, 7, 8, 16
-- Date: 2026-02-08

-- ERROR 4: Add imputed_fields tracking to clinical_submissions
ALTER TABLE clinical_submissions ADD COLUMN imputed_fields TEXT;

-- ERROR 5: Add doctor override tracking columns to triage_results
ALTER TABLE triage_results ADD COLUMN original_triage_level TEXT;
ALTER TABLE triage_results ADD COLUMN override_reason TEXT;
ALTER TABLE triage_results ADD COLUMN override_timestamp DATETIME;

-- ERROR 6: Add reviewer_id tracking
ALTER TABLE triage_results ADD COLUMN reviewer_id INTEGER REFERENCES users(id);

-- ERROR 2: Add assessment_type tracking
ALTER TABLE triage_results ADD COLUMN assessment_type TEXT DEFAULT 'full';

-- ERROR 3: Add safety net tracking
ALTER TABLE triage_results ADD COLUMN safety_net_triggered BOOLEAN DEFAULT 0;
ALTER TABLE triage_results ADD COLUMN safety_net_findings TEXT;

-- ERROR 7: Add low confidence flag
ALTER TABLE triage_results ADD COLUMN requires_immediate_review BOOLEAN DEFAULT 0;

-- ERROR 16: Add target evaluation time
ALTER TABLE triage_results ADD COLUMN target_evaluation_time DATETIME;

-- ERROR 13: Add emergency contact to users
ALTER TABLE users ADD COLUMN emergency_contact TEXT;

-- ERROR 10: Add soft delete columns to users
ALTER TABLE users ADD COLUMN deactivated_at DATETIME;
ALTER TABLE users ADD COLUMN deactivated_by INTEGER;

-- ERROR 10: Add username snapshot to audit_log
ALTER TABLE audit_log ADD COLUMN username TEXT;

-- Populate original_triage_level for existing records
UPDATE triage_results 
SET original_triage_level = triage_level 
WHERE original_triage_level IS NULL;

-- Populate username in audit_log for existing records
UPDATE audit_log 
SET username = (SELECT username FROM users WHERE users.id = audit_log.user_id)
WHERE username IS NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_triage_reviewer ON triage_results(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_triage_assessment_type ON triage_results(assessment_type);
CREATE INDEX IF NOT EXISTS idx_triage_target_time ON triage_results(target_evaluation_time);
CREATE INDEX IF NOT EXISTS idx_users_deactivated ON users(is_active, deactivated_at);
