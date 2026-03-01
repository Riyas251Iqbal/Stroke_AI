-- Migration 002: Add temporal context, review workflow, recording date, structured audit
-- Issues: #5 (temporal context), #9 (recording date), #10 (review status), #14 (audit log)
-- Date: 2026-02-12

-- Issue #5: Temporal context for symptom assessment
ALTER TABLE clinical_submissions ADD COLUMN assessment_reason TEXT CHECK(
    assessment_reason IN ('active_symptoms', 'routine_screening', 'follow_up')
);
ALTER TABLE clinical_submissions ADD COLUMN symptom_onset_time TIMESTAMP;
ALTER TABLE clinical_submissions ADD COLUMN symptoms_during_recording BOOLEAN DEFAULT 0;

-- Issue #9: Recording timestamp for audio records
ALTER TABLE audio_records ADD COLUMN recording_date TIMESTAMP;

-- Backfill recording_date with upload_date for existing records
UPDATE audio_records SET recording_date = upload_date WHERE recording_date IS NULL;

-- Issue #10: Review status workflow
ALTER TABLE triage_results ADD COLUMN review_status TEXT DEFAULT 'pending';
ALTER TABLE triage_results ADD COLUMN assigned_to INTEGER REFERENCES users(id);

-- Backfill review_status based on existing reviewed_by_doctor
UPDATE triage_results 
SET review_status = CASE 
    WHEN reviewed_by_doctor IS NOT NULL THEN 'reviewed'
    ELSE 'pending'
END
WHERE review_status IS NULL OR review_status = 'pending';

-- Issue #14: Structured audit log fields
ALTER TABLE audit_log ADD COLUMN before_value TEXT;
ALTER TABLE audit_log ADD COLUMN after_value TEXT;
ALTER TABLE audit_log ADD COLUMN change_reason TEXT;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_clinical_assessment_reason ON clinical_submissions(assessment_reason);
CREATE INDEX IF NOT EXISTS idx_active_symptoms ON clinical_submissions(assessment_reason, submission_date);
CREATE INDEX IF NOT EXISTS idx_triage_review_status ON triage_results(review_status);
CREATE INDEX IF NOT EXISTS idx_triage_assigned ON triage_results(assigned_to);
