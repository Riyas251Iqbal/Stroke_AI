import sys
import os
import sqlite3
import json

with open("latest_eval_log.txt", "w") as f:
    sys.stdout = f
    sys.stderr = f
    print("Starting...")
    try:
        # Add backend to path
        backend_dir = r"e:\Main_Project\stroke-ai\stroke-ai\backend"
        sys.path.append(backend_dir)
        os.chdir(backend_dir)

        from utils.risk_scoring import StrokeRiskScorer

        # Find latest audio
        conn = sqlite3.connect('database.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM audio_records ORDER BY id DESC LIMIT 1')
        r = dict(c.fetchone())
        audio_path = r['audio_path']

        print(f"Testing audio path: {audio_path}")

        scorer = StrokeRiskScorer()
        risk = scorer.predict_new_audio_risk(audio_path)
        print(f"Returned Final Ensembled Risk Score: {risk}")
    except Exception as e:
        import traceback
        print(f"CRASH: {e}")
        traceback.print_exc()


# Also print clinical fallback risk
c.execute('SELECT * FROM triage_results ORDER BY id DESC LIMIT 1')
tr = dict(c.fetchone())
print(f"\nFinal DB Triage Result:")
print(f"Risk Score: {tr['risk_score']}")
print(f"Level: {tr['triage_level']}")
print(f"Confidence: {tr['confidence_score']}")
print(f"Assessment Type: {tr['assessment_type']}")
