"""
Emergency Notification Service (Issue #4)
Stub implementation for alerting on-call physicians about emergency triage results.
Currently logs to console. Replace with Twilio/SendGrid integration for production.
"""

import os
import json
from datetime import datetime
from typing import Dict, Optional
from utils.db import execute_query, log_audit


class NotificationService:
    """
    Manages emergency notifications for critical triage results.
    
    Production deployment should replace the stub methods with actual
    SMS (Twilio) and Email (SendGrid) integrations.
    """
    
    def __init__(self):
        """Initialize notification service."""
        # In production, these would come from environment variables:
        # self.twilio_sid = os.getenv('TWILIO_ACCOUNT_SID')
        # self.twilio_token = os.getenv('TWILIO_AUTH_TOKEN')
        # self.twilio_from = os.getenv('TWILIO_FROM_NUMBER')
        # self.sendgrid_key = os.getenv('SENDGRID_API_KEY')
        self.notifications_enabled = os.getenv('NOTIFICATIONS_ENABLED', 'false').lower() == 'true'
    
    def send_emergency_alert(self, triage_result: Dict, patient_info: Dict) -> bool:
        """
        Send immediate notification to assigned physician for high-risk cases.
        
        Args:
            triage_result: Triage result dict with risk_score, triage_level, etc.
            patient_info: Patient demographics (name, age, id, address, preferred_doctor_id, hospital_name)
        
        Returns:
            bool: True if notification was sent/logged successfully
        """
        triage_level = triage_result.get('triage_level', '')
        if triage_level not in ('High', 'Emergency'):
            return False
        
        # Build alert message
        message = self._build_emergency_message(triage_result, patient_info)
        
        # Get the patient's assigned doctor (or fallback to on-call doctors)
        target_doctors = self._get_target_doctors(patient_info)
        
        if not target_doctors:
            print(f"⚠ WARNING: No doctors available for emergency alert!")
            print(f"  Emergency case for patient {patient_info.get('full_name', 'Unknown')}")
            self._log_notification_attempt(
                triage_result_id=triage_result.get('triage_result_id'),
                status='no_doctor_found',
                message=message
            )
            return False
        
        success = True
        for doctor in target_doctors:
            sent = self._send_notification(doctor, message)
            if not sent:
                success = False
            
            self._log_notification_attempt(
                triage_result_id=triage_result.get('triage_result_id'),
                doctor_id=doctor.get('id'),
                status='sent' if sent else 'failed',
                message=message
            )
        
        return success
    
    def _build_emergency_message(self, triage_result: Dict, patient_info: Dict) -> str:
        """Build the emergency alert message with address for ambulance dispatch."""
        clinical_flags = triage_result.get('clinical_flags', [])
        if isinstance(clinical_flags, str):
            try:
                clinical_flags = json.loads(clinical_flags)
            except (json.JSONDecodeError, TypeError):
                clinical_flags = []
        
        top_flags = clinical_flags[:3] if clinical_flags else ['No specific flags']
        
        message = (
            f"🚨 EMERGENCY STROKE RISK ALERT\n"
            f"ACTION REQUIRED: DISPATCH AMBULANCE IMMEDIATELY\n\n"
            f"🚑 DISPATCH ADDRESS:\n  {patient_info.get('address', 'Address not provided')}\n\n"
            f"Patient: {patient_info.get('full_name', 'Unknown')} (ID: {patient_info.get('id', 'N/A')})\n"
            f"Risk Score: {triage_result.get('risk_score', 0):.2f}\n"
            f"Triage Level: {triage_result.get('triage_level', 'Unknown')}\n"
        )
        
        # Hospital info
        
        # Hospital info
        hospital_name = patient_info.get('hospital_name')
        hospital_phone = patient_info.get('hospital_phone')
        if hospital_name:
            message += f"🏥 Assigned Hospital: {hospital_name}\n"
            if hospital_phone:
                message += f"   Hospital Phone: {hospital_phone}\n"
            message += "\n"
        
        message += f"Top Risk Factors:\n"
        for flag in top_flags:
            message += f"  - {flag}\n"
        
        if triage_result.get('safety_net_triggered'):
            message += "\n⚠ SAFETY NET TRIGGERED: Audio analysis detected critical abnormalities\n"
        
        message += (
            f"\nReview immediately in doctor dashboard.\n"
            f"Case ID: {triage_result.get('triage_result_id', 'N/A')}\n"
            f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        )
        
        return message
    
    def _get_target_doctors(self, patient_info: Dict = None):
        """
        Get the patient's assigned doctor first; fallback to all active doctors.
        """
        try:
            # First try patient's assigned doctor
            preferred_doctor_id = patient_info.get('preferred_doctor_id') if patient_info else None
            if preferred_doctor_id:
                query = """
                    SELECT id, full_name, email, phone
                    FROM users 
                    WHERE id = ? AND role = 'doctor' AND is_active = 1
                """
                doctors = execute_query(query, (preferred_doctor_id,))
                if doctors:
                    return doctors
            
            # Fallback: all active doctors at the same hospital
            hospital_id = patient_info.get('hospital_id') if patient_info else None
            if hospital_id:
                query = """
                    SELECT id, full_name, email, phone
                    FROM users 
                    WHERE role = 'doctor' AND is_active = 1 AND hospital_id = ?
                    ORDER BY last_login DESC
                    LIMIT 3
                """
                doctors = execute_query(query, (hospital_id,))
                if doctors:
                    return doctors
            
            # Final fallback: any active doctor
            query = """
                SELECT id, full_name, email, phone
                FROM users 
                WHERE role = 'doctor' AND is_active = 1
                ORDER BY last_login DESC
                LIMIT 3
            """
            doctors = execute_query(query)
            return doctors if doctors else []
        except Exception as e:
            print(f"Error fetching target doctors: {e}")
            return []
    
    def _send_notification(self, doctor: Dict, message: str) -> bool:
        """
        Send notification to a specific doctor.
        
        STUB: Logs to console. Replace with real integration:
        - SMS via Twilio
        - Email via SendGrid
        - Push notification via Firebase
        """
        print("\n" + "=" * 60)
        print("📱 EMERGENCY NOTIFICATION (STUB)")
        print("=" * 60)
        print(f"To: Dr. {doctor.get('full_name', 'Unknown')}")
        print(f"Email: {doctor.get('email', 'N/A')}")
        print(f"Phone: {doctor.get('phone', 'N/A')}")
        print("-" * 60)
        print(message)
        print("=" * 60 + "\n")
        
        # In production:
        # if self.notifications_enabled:
        #     self._send_sms(doctor['phone'], message)
        #     self._send_email(doctor['email'], "🚨 URGENT: Emergency Stroke Risk Case", message)
        
        return True
    
    def _log_notification_attempt(self, triage_result_id: int = None,
                                   doctor_id: int = None,
                                   status: str = 'unknown',
                                   message: str = '') -> None:
        """Log notification attempt to audit log."""
        try:
            details = json.dumps({
                'notification_status': status,
                'message_preview': message[:200] if message else '',
                'doctor_id': doctor_id
            })
            
            log_audit(
                user_id=doctor_id,
                action='emergency_alert_sent',
                resource_type='triage_result',
                resource_id=triage_result_id,
                details=details
            )
        except Exception as e:
            print(f"Error logging notification: {e}")


# Singleton instance
_notification_service = None

def get_notification_service() -> NotificationService:
    """Get or create the notification service singleton."""
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService()
    return _notification_service
