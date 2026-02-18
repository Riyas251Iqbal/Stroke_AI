"""
Smart Clinical Triage Logic
Converts risk scores into actionable triage decisions with clinical recommendations.
This is a Clinical Decision Support System (CDSS), NOT a diagnostic tool.
"""

from typing import Dict, List, Tuple
from enum import Enum


class TriageLevel(Enum):
    """Triage priority levels for clinical action."""
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    EMERGENCY = "Emergency"


class TriageDecisionEngine:
    """
    Intelligent triage decision system that converts risk scores
    into clinically-actionable triage levels with recommendations.
    """
    
    # Triage thresholds based on risk score (from model_metadata.json)
    EMERGENCY_THRESHOLD = 0.85  # Emergency - immediate evaluation
    HIGH_THRESHOLD = 0.60       # High risk - urgent assessment
    MEDIUM_THRESHOLD = 0.30     # Moderate risk - prompt assessment
    # Below medium threshold = Low priority
    
    def __init__(self):
        """Initialize the triage decision engine."""
        pass
    
    def determine_triage_level(self, risk_score: float, 
                              clinical_flags: List[str]) -> TriageLevel:
        """
        Determine triage level based on risk score and clinical flags.
        
        Args:
            risk_score: Computed stroke risk score (0.0 to 1.0)
            clinical_flags: List of concerning clinical indicators
        
        Returns:
            TriageLevel enum value
        """
        # Emergency triage: Very high risk score
        if risk_score >= self.EMERGENCY_THRESHOLD:
            return TriageLevel.EMERGENCY
        
        # Emergency override: Critical clinical flags present
        critical_flags = [
            "Severely elevated glucose",
            "Advanced age (>65 years)",
            "History of heart disease"
        ]
        
        has_critical_flags = any(
            flag in ' '.join(clinical_flags) 
            for flag in critical_flags
        )
        
        if risk_score >= 0.75 and has_critical_flags:
            return TriageLevel.EMERGENCY
        
        # High triage: High risk
        if risk_score >= self.HIGH_THRESHOLD:
            return TriageLevel.HIGH
        
        # Medium triage: Moderate risk
        if risk_score >= self.MEDIUM_THRESHOLD:
            return TriageLevel.MEDIUM
        
        # Medium override: Multiple risk factors
        if len(clinical_flags) >= 4 and risk_score >= 0.20:
            return TriageLevel.MEDIUM
        
        # Low triage: Low risk
        return TriageLevel.LOW
    
    def generate_recommendation(self, triage_level: TriageLevel, 
                               risk_score: float,
                               clinical_flags: List[str]) -> str:
        """
        Generate clinical recommendation based on triage level.
        
        Args:
            triage_level: Determined triage level
            risk_score: Risk score
            clinical_flags: Clinical flags
        
        Returns:
            Clinical recommendation string
        """
        if triage_level == TriageLevel.EMERGENCY:
            return self._emergency_recommendation(risk_score, clinical_flags)
        elif triage_level == TriageLevel.HIGH:
            return self._high_recommendation(risk_score, clinical_flags)
        elif triage_level == TriageLevel.MEDIUM:
            return self._medium_recommendation(risk_score, clinical_flags)
        else:
            return self._low_recommendation(risk_score, clinical_flags)
    
    def _emergency_recommendation(self, risk_score: float, 
                                 flags: List[str]) -> str:
        """Generate emergency triage recommendation."""
        rec = (
            f"EMERGENCY TRIAGE (Risk Score: {risk_score:.2f})\n\n"
            "IMMEDIATE ACTION REQUIRED:\n"
            "• Patient requires urgent neurological evaluation\n"
            "• Contact on-call neurologist immediately\n"
            "• Prepare for potential acute stroke protocol activation\n"
            "• Obtain comprehensive stroke assessment (NIH Stroke Scale)\n"
            "• Consider immediate neuroimaging (CT/MRI brain)\n"
            "• Monitor vital signs continuously\n"
            "• Ensure IV access is established\n\n"
            "CRITICAL RISK FACTORS IDENTIFIED:\n"
        )
        
        for flag in flags:
            rec += f"• {flag}\n"
        
        rec += (
            "\n⚠️ CLINICAL DECISION SUPPORT ALERT:\n"
            "This is an early warning system. Clinical judgment must guide all decisions. "
            "This system assists triage prioritization but does NOT replace comprehensive "
            "neurological examination and physician assessment."
        )
        
        return rec
    
    def _high_recommendation(self, risk_score: float, flags: List[str]) -> str:
        """Generate high priority triage recommendation."""
        rec = (
            f"HIGH PRIORITY TRIAGE (Risk Score: {risk_score:.2f})\n\n"
            "URGENT ACTIONS REQUIRED:\n"
            "• Schedule urgent neurological evaluation within 4-6 hours\n"
            "• Contact on-call neurologist for consultation\n"
            "• Obtain neurological assessment (NIH Stroke Scale if indicated)\n"
            "• Consider urgent neuroimaging (CT/MRI brain)\n"
            "• Comprehensive vital signs monitoring\n"
            "• Review and optimize vascular risk factors immediately\n"
            "• Patient education on stroke warning signs (F.A.S.T.)\n\n"
            "SIGNIFICANT RISK FACTORS IDENTIFIED:\n"
        )
        
        for flag in flags:
            rec += f"• {flag}\n"
        
        rec += (
            "\n⚠️ CLINICAL DECISION SUPPORT ALERT:\n"
            "Patient presents with HIGH stroke risk. Urgent clinical evaluation is recommended. "
            "This system assists triage prioritization but does NOT replace comprehensive "
            "neurological examination and physician assessment."
        )
        
        return rec
    
    def _medium_recommendation(self, risk_score: float, flags: List[str]) -> str:
        """Generate medium priority triage recommendation."""
        rec = (
            f"MEDIUM PRIORITY TRIAGE (Risk Score: {risk_score:.2f})\n\n"
            "RECOMMENDED ACTIONS:\n"
            "• Schedule comprehensive clinical evaluation within 24-48 hours\n"
            "• Physician review of risk factors and clinical presentation\n"
            "• Consider neurological consultation if symptoms present\n"
            "• Obtain relevant laboratory studies (lipid panel, HbA1c, CBC)\n"
            "• Review and optimize management of vascular risk factors\n"
            "• Patient education on stroke warning signs (F.A.S.T.)\n"
            "• Follow-up appointment scheduling\n\n"
            "IDENTIFIED RISK FACTORS:\n"
        )
        
        for flag in flags:
            rec += f"• {flag}\n"
        
        rec += (
            "\n📋 CLINICAL GUIDANCE:\n"
            "Patient has moderate stroke risk factors requiring medical attention. "
            "Focus on primary prevention strategies and risk factor modification. "
            "Educate patient on early stroke symptoms and when to seek emergency care."
        )
        
        return rec
    
    def _low_recommendation(self, risk_score: float, flags: List[str]) -> str:
        """Generate low priority triage recommendation."""
        rec = (
            f"LOW PRIORITY TRIAGE (Risk Score: {risk_score:.2f})\n\n"
            "RECOMMENDED ACTIONS:\n"
            "• Routine clinical follow-up as per standard care protocols\n"
            "• Continue regular health maintenance and wellness visits\n"
            "• Lifestyle counseling (diet, exercise, smoking cessation if applicable)\n"
            "• Monitor and manage any identified risk factors\n"
            "• Annual cardiovascular risk assessment\n"
            "• Patient education on stroke prevention\n\n"
        )
        
        if flags:
            rec += "NOTED CONSIDERATIONS:\n"
            for flag in flags:
                rec += f"• {flag}\n"
            rec += "\n"
        
        rec += (
            "✓ REASSURANCE:\n"
            "Current assessment indicates lower immediate stroke risk. "
            "Continue healthy lifestyle practices and regular medical care. "
            "Remain vigilant for stroke warning signs: sudden numbness, confusion, "
            "vision problems, difficulty walking, or severe headache."
        )
        
        return rec
    
    def get_time_to_evaluation(self, triage_level: TriageLevel) -> str:
        """
        Get recommended time to clinical evaluation.
        
        Args:
            triage_level: Triage level
        
        Returns:
            Time recommendation string
        """
        if triage_level == TriageLevel.EMERGENCY:
            return "IMMEDIATE (within 1 hour)"
        elif triage_level == TriageLevel.HIGH:
            return "Urgent (within 4-6 hours)"
        elif triage_level == TriageLevel.MEDIUM:
            return "Soon (within 24-48 hours)"
        else:
            return "Routine (as per standard care)"
    
    def get_suggested_specialists(self, triage_level: TriageLevel,
                                 clinical_flags: List[str]) -> List[str]:
        """
        Suggest appropriate specialist consultations.
        
        Args:
            triage_level: Triage level
            clinical_flags: Clinical flags
        
        Returns:
            List of suggested specialists
        """
        specialists = []
        
        if triage_level == TriageLevel.EMERGENCY:
            specialists.append("Neurologist (Stroke Specialist)")
            specialists.append("Emergency Medicine Physician")
        
        if triage_level in (TriageLevel.HIGH, TriageLevel.MEDIUM, TriageLevel.EMERGENCY):
            # Check for specific risk factors
            if any("heart disease" in flag.lower() for flag in clinical_flags):
                specialists.append("Cardiologist")
            
            if any("diabetes" in flag.lower() for flag in clinical_flags):
                specialists.append("Endocrinologist")
            
            if any("hypertension" in flag.lower() for flag in clinical_flags):
                specialists.append("Hypertension Specialist")
        
        if not specialists:
            specialists.append("Primary Care Physician")
        
        return specialists
    
    def create_triage_report(self, risk_score: float, confidence: float,
                           clinical_flags: List[str],
                           feature_importance: Dict[str, float]) -> Dict[str, any]:
        """
        Create comprehensive triage report with all decision support information.
        
        Args:
            risk_score: Risk score (0-1)
            confidence: Model confidence (0-1)
            clinical_flags: List of clinical flags
            feature_importance: Feature importance scores
        
        Returns:
            Complete triage report dictionary
        """
        # Determine triage level
        triage_level = self.determine_triage_level(risk_score, clinical_flags)
        
        # Generate recommendation
        recommendation = self.generate_recommendation(
            triage_level, risk_score, clinical_flags
        )
        
        # Time to evaluation
        time_to_eval = self.get_time_to_evaluation(triage_level)
        
        # Suggested specialists
        specialists = self.get_suggested_specialists(triage_level, clinical_flags)
        
        # Priority score (for queue management)
        priority_score = self._calculate_priority_score(
            triage_level, risk_score, clinical_flags
        )
        
        return {
            'triage_level': triage_level.value,
            'risk_score': round(risk_score, 3),
            'confidence_score': round(confidence, 3),
            'priority_score': priority_score,
            'recommendation': recommendation,
            'time_to_evaluation': time_to_eval,
            'suggested_specialists': specialists,
            'clinical_flags': clinical_flags,
            'feature_importance': feature_importance,
            'disclaimer': self._get_disclaimer()
        }
    
    def _calculate_priority_score(self, triage_level: TriageLevel,
                                 risk_score: float,
                                 clinical_flags: List[str]) -> int:
        """
        Calculate numerical priority score for queue management.
        Higher score = higher priority.
        
        Args:
            triage_level: Triage level
            risk_score: Risk score
            clinical_flags: Clinical flags
        
        Returns:
            Priority score (0-100)
        """
        if triage_level == TriageLevel.EMERGENCY:
            base_score = 80
        elif triage_level == TriageLevel.HIGH:
            base_score = 65
        elif triage_level == TriageLevel.MEDIUM:
            base_score = 50
        else:
            base_score = 20
        
        # Add points for risk score
        risk_points = int(risk_score * 15)
        
        # Add points for clinical flags
        flag_points = min(len(clinical_flags) * 1, 5)
        
        return min(base_score + risk_points + flag_points, 100)
    
    def _get_disclaimer(self) -> str:
        """Get clinical disclaimer for triage system."""
        return (
            "⚕️ CLINICAL DECISION SUPPORT SYSTEM DISCLAIMER\n\n"
            "This is an EARLY WARNING and TRIAGE PRIORITIZATION system designed to "
            "assist healthcare professionals in clinical decision-making. It is NOT "
            "a diagnostic tool and does NOT replace:\n\n"
            "• Comprehensive neurological examination\n"
            "• Clinical judgment of qualified healthcare providers\n"
            "• Standard stroke assessment protocols (NIH Stroke Scale, FAST)\n"
            "• Neuroimaging and laboratory diagnostics\n"
            "• Established clinical care guidelines\n\n"
            "All triage decisions must be reviewed and validated by licensed medical "
            "professionals. This system provides risk assessment and prioritization "
            "guidance only. Final clinical decisions rest with the treating physician.\n\n"
            "In case of suspected acute stroke: Call emergency services immediately. "
            "Time-sensitive intervention is critical for optimal outcomes."
        )
    
    def adjust_triage_for_temporal_context(self, base_triage: TriageLevel,
                                           clinical_submission: dict) -> TriageLevel:
        """
        Escalate urgency for active symptoms with recent onset (Issue #5).
        
        The acute stroke treatment window is ~4.5 hours. If a patient reports
        active symptoms within this window and has at least Medium risk,
        escalate to Emergency for immediate evaluation.
        
        Args:
            base_triage: Original triage level from risk score
            clinical_submission: Clinical submission dict with temporal fields
        
        Returns:
            Potentially escalated TriageLevel
        """
        assessment_reason = clinical_submission.get('assessment_reason')
        
        if assessment_reason != 'active_symptoms':
            return base_triage
        
        symptom_onset_time = clinical_submission.get('symptom_onset_time')
        if not symptom_onset_time:
            # Active symptoms reported but no onset time — treat as urgent
            if base_triage == TriageLevel.LOW:
                return TriageLevel.MEDIUM
            return base_triage
        
        # Calculate hours since symptom onset
        from datetime import datetime
        if isinstance(symptom_onset_time, str):
            try:
                symptom_onset_time = datetime.fromisoformat(symptom_onset_time)
            except ValueError:
                return base_triage
        
        time_since_onset = datetime.now() - symptom_onset_time
        hours_since_onset = time_since_onset.total_seconds() / 3600
        
        # Acute stroke window: escalate if within 4.5 hours
        if hours_since_onset <= 4.5 and base_triage == TriageLevel.MEDIUM:
            return TriageLevel.EMERGENCY
        
        # Even outside window, active symptoms bump Low → Medium
        if base_triage == TriageLevel.LOW:
            return TriageLevel.MEDIUM
        
        return base_triage
    
    def apply_confidence_escalation(self, triage_level: TriageLevel,
                                     confidence_score: float) -> tuple:
        """
        Escalate triage if confidence is low (Issue #8).
        
        Low-confidence predictions should prompt additional human review.
        Cases with <70% confidence are flagged for senior review.
        
        Args:
            triage_level: Current triage level
            confidence_score: Model confidence (0.0-1.0)
        
        Returns:
            Tuple of (final_triage_level, requires_senior_review)
        """
        requires_senior_review = False
        
        if confidence_score < 0.70:
            requires_senior_review = True
            
            # Escalate Low → Medium if uncertain
            if triage_level == TriageLevel.LOW:
                triage_level = TriageLevel.MEDIUM
        
        return triage_level, requires_senior_review


# Convenience function
def perform_triage_assessment(risk_score: float, confidence: float,
                             clinical_flags: List[str],
                             feature_importance: Dict[str, float]) -> Dict[str, any]:
    """
    Perform complete triage assessment.
    
    Args:
        risk_score: Stroke risk score
        confidence: Model confidence
        clinical_flags: Clinical flags
        feature_importance: Feature importance
    
    Returns:
        Complete triage report
    """
    engine = TriageDecisionEngine()
    return engine.create_triage_report(
        risk_score, confidence, clinical_flags, feature_importance
    )