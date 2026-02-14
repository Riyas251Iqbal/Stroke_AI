"""
Utility helper functions for Stroke-AI CDSS
Includes age calculation, data imputation, and validation functions
"""
from datetime import datetime
import re


# ============================================================================
# ERROR 1 FIX: Age Calculation
# ============================================================================

def calculate_age(date_of_birth):
    """
    Calculate current age from date of birth.
    
    Args:
        date_of_birth: Either a string in 'YYYY-MM-DD' format or datetime object
    
    Returns:
        int: Current age in years
    
    Raises:
        ValueError: If date_of_birth is invalid or results in age < 0 or > 120
    """
    if not date_of_birth:
        raise ValueError("Date of birth is required")
    
    # Convert string to datetime if needed
    if isinstance(date_of_birth, str):
        try:
            dob = datetime.strptime(date_of_birth, '%Y-%m-%d')
        except ValueError:
            raise ValueError("Date of birth must be in YYYY-MM-DD format")
    else:
        dob = date_of_birth
    
    # Calculate age
    today = datetime.today()
    age = today.year - dob.year
    
    # Adjust if birthday hasn't occurred this year
    if (today.month, today.day) < (dob.month, dob.day):
        age -= 1
    
    # Validate age range
    if age < 0:
        raise ValueError("Date of birth cannot be in the future")
    if age > 120:
        raise ValueError("Invalid date of birth (age > 120 years)")
    
    return age


def validate_date_of_birth(date_of_birth):
    """
    Validate date of birth for registration.
    
    Args:
        date_of_birth: String in 'YYYY-MM-DD' format
    
    Returns:
        bool: True if valid
    
    Raises:
        ValueError: If DOB is invalid or age is outside acceptable range
    """
    age = calculate_age(date_of_birth)
    
    # Must be at least 18 years old
    if age < 18:
        raise ValueError("User must be at least 18 years old")
    
    return True


# ============================================================================
# ERROR 4 FIX: Missing Value Imputation
# ============================================================================

# Population means for stroke-risk population
DEFAULT_VALUES = {
    'bmi': 28.5,  # Average BMI for stroke-risk population
    'avg_glucose_level': 110.0  # Average fasting glucose (mg/dL)
}


def impute_missing_values(clinical_data):
    """
    Impute missing clinical values with population means.
    
    Args:
        clinical_data: Dictionary of clinical data
    
    Returns:
        tuple: (imputed_data, list of imputed field names)
    """
    imputed_fields = []
    
    # Create a copy to avoid modifying original
    data = clinical_data.copy()
    
    # Impute BMI if missing or empty
    if not data.get('bmi') or data['bmi'] == '' or data['bmi'] is None:
        data['bmi'] = DEFAULT_VALUES['bmi']
        imputed_fields.append('bmi')
    
    # Impute glucose if missing or empty
    if not data.get('avg_glucose_level') or data['avg_glucose_level'] == '' or data['avg_glucose_level'] is None:
        data['avg_glucose_level'] = DEFAULT_VALUES['avg_glucose_level']
        imputed_fields.append('avg_glucose_level')
    
    return data, imputed_fields


def calculate_confidence_penalty(imputed_fields, has_audio=True):
    """
    Calculate confidence score penalty based on missing data.
    
    Args:
        imputed_fields: List of field names that were imputed
        has_audio: Whether audio analysis is available
    
    Returns:
        float: Confidence penalty (0.0 to 1.0)
    """
    penalty = 0.0
    
    # 10% penalty per imputed field
    penalty += 0.1 * len(imputed_fields)
    
    # 20% penalty if audio is missing
    if not has_audio:
        penalty += 0.2
    
    return min(penalty, 0.5)  # Cap at 50% penalty


# ============================================================================
# ERROR 11 FIX: Gender Encoding
# ============================================================================

def encode_gender(gender):
    """
    Encode gender for ML model input.
    
    Args:
        gender: String ('Male', 'Female', or 'Other')
    
    Returns:
        int: Encoded value (0 for Male, 1 for Female/Other)
    """
    gender_map = {
        'Male': 0,
        'Female': 1,
        'Other': 1  # Default to Female encoding for ML model
    }
    return gender_map.get(gender, 1)


# ============================================================================
# ERROR 12 FIX: Work Type Validation
# ============================================================================

VALID_WORK_TYPES = [
    'Government_job',
    'Private',
    'Self_employed',
    'Children',
    'Never_worked'
]

VALID_SMOKING_STATUS = [
    'never',
    'formerly',
    'current'
]

VALID_RESIDENCE_TYPES = [
    'Urban',
    'Rural'
]


def validate_clinical_data(data):
    """
    Validate clinical data fields.
    
    Args:
        data: Dictionary of clinical data
    
    Raises:
        ValueError: If any field is invalid
    """
    # Validate work_type
    if 'work_type' in data and data['work_type'] not in VALID_WORK_TYPES:
        raise ValueError(f"Invalid work_type. Must be one of: {', '.join(VALID_WORK_TYPES)}")
    
    # Validate smoking_status
    if 'smoking_status' in data and data['smoking_status'] not in VALID_SMOKING_STATUS:
        raise ValueError(f"Invalid smoking_status. Must be one of: {', '.join(VALID_SMOKING_STATUS)}")
    
    # Validate residence_type
    if 'residence_type' in data and data['residence_type'] not in VALID_RESIDENCE_TYPES:
        raise ValueError(f"Invalid residence_type. Must be one of: {', '.join(VALID_RESIDENCE_TYPES)}")
    
    # Validate gender
    if 'gender' in data and data['gender'] not in ['Male', 'Female', 'Other']:
        raise ValueError("Invalid gender. Must be Male, Female, or Other")
    
    # Validate boolean fields
    boolean_fields = ['hypertension', 'heart_disease', 'diabetes', 'ever_married']
    for field in boolean_fields:
        if field in data and data[field] not in [0, 1, '0', '1', True, False]:
            raise ValueError(f"Invalid {field}. Must be 0 or 1")
    
    # Validate numeric ranges
    if 'bmi' in data and data['bmi'] is not None:
        bmi = float(data['bmi'])
        if bmi < 10 or bmi > 60:
            raise ValueError("BMI must be between 10 and 60")
    
    if 'avg_glucose_level' in data and data['avg_glucose_level'] is not None:
        glucose = float(data['avg_glucose_level'])
        if glucose < 50 or glucose > 400:
            raise ValueError("Average glucose level must be between 50 and 400 mg/dL")


# ============================================================================
# ERROR 14 FIX: Referral Specialty Validation
# ============================================================================

VALID_SPECIALTIES = [
    'Neurology',
    'Cardiology',
    'Endocrinology',
    'Vascular_Surgery',
    'Physical_Therapy',
    'Psychiatry',
    'Other'
]


def validate_referral_specialty(specialty):
    """
    Validate referral specialty.
    
    Args:
        specialty: String specialty name
    
    Raises:
        ValueError: If specialty is invalid
    """
    if specialty and specialty not in VALID_SPECIALTIES:
        raise ValueError(f"Invalid specialty. Must be one of: {', '.join(VALID_SPECIALTIES)}")


# ============================================================================
# ERROR 16 FIX: Target Evaluation Time Calculation
# ============================================================================

def calculate_target_evaluation_time(triage_level, assessment_date=None):
    """
    Calculate when patient should be evaluated based on triage level.
    
    Args:
        triage_level: String ('Emergency', 'Medium', or 'Low')
        assessment_date: Datetime object (defaults to now)
    
    Returns:
        datetime: Target evaluation time
    """
    from datetime import timedelta
    
    if assessment_date is None:
        assessment_date = datetime.now()
    
    if triage_level == 'Emergency':
        # Within 1 hour
        target = assessment_date + timedelta(hours=1)
    elif triage_level == 'Medium':
        # Within 24-48 hours (use 48 as deadline)
        target = assessment_date + timedelta(hours=48)
    else:  # Low
        # Within 30 days
        target = assessment_date + timedelta(days=30)
    
    return target


def is_overdue(target_evaluation_time):
    """
    Check if evaluation is overdue.
    
    Args:
        target_evaluation_time: Datetime object
    
    Returns:
        bool: True if overdue
    """
    if isinstance(target_evaluation_time, str):
        target = datetime.strptime(target_evaluation_time, '%Y-%m-%d %H:%M:%S')
    else:
        target = target_evaluation_time
    
    return datetime.now() > target


# ============================================================================
# Utility Functions
# ============================================================================

def sanitize_input(text, max_length=500):
    """
    Sanitize text input to prevent injection attacks.
    
    Args:
        text: Input text
        max_length: Maximum allowed length
    
    Returns:
        str: Sanitized text
    """
    if not text:
        return ""
    
    # Convert to string and strip whitespace
    text = str(text).strip()
    
    # Truncate to max length
    text = text[:max_length]
    
    return text


def format_phone_number(phone):
    """
    Format phone number for consistency.
    
    Args:
        phone: Phone number string
    
    Returns:
        str: Formatted phone number or None if invalid
    """
    if not phone:
        return None
    
    # Remove all non-digit characters
    digits = re.sub(r'\D', '', phone)
    
    # Validate length (10 digits for US)
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    elif len(digits) == 11 and digits[0] == '1':
        return f"+1 ({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
    
    return phone  # Return original if can't format
