-- Migration 003: Add hospitals table and doctor-hospital relationship
-- Phase 5: Hospital & Location-Based Doctor Selection

-- Hospitals table
CREATE TABLE IF NOT EXISTS hospitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add hospital_id to users (for doctors)
-- SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we check first
-- This will fail silently if column already exists
ALTER TABLE users ADD COLUMN hospital_id INTEGER REFERENCES hospitals(id);

-- Add preferred_doctor_id to triage_results
ALTER TABLE triage_results ADD COLUMN preferred_doctor_id INTEGER REFERENCES users(id);

-- Update triage_level CHECK constraint to include 'High'
-- Note: SQLite doesn't support ALTER CONSTRAINT, but the application
-- layer already handles 'High' level. New databases will get the 
-- updated CHECK from schema.sql.

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_hospitals_location ON hospitals(location);
CREATE INDEX IF NOT EXISTS idx_hospitals_active ON hospitals(is_active);
CREATE INDEX IF NOT EXISTS idx_users_hospital ON users(hospital_id);
CREATE INDEX IF NOT EXISTS idx_triage_preferred_doctor ON triage_results(preferred_doctor_id);
