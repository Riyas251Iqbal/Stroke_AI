"""
Migration: Add pending_hospitals table
For doctor registration "Others" hospital option with admin approval workflow.
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database.db')

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pending_hospitals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            location TEXT NOT NULL,
            address TEXT,
            phone TEXT,
            submitted_by INTEGER,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
            reviewed_by INTEGER,
            reviewed_at TIMESTAMP,
            review_note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)
    
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pending_hospitals_status ON pending_hospitals(status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pending_hospitals_submitted_by ON pending_hospitals(submitted_by)")
    
    conn.commit()
    conn.close()
    print("Migration complete: pending_hospitals table created.")

if __name__ == '__main__':
    migrate()
