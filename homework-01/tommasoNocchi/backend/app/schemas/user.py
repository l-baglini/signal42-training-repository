import uuid
from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel, EmailStr

from app.models.user import UserRole


class UserBase(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    phone: Optional[str] = None


class UserRead(UserBase):
    id: uuid.UUID
    role: UserRole
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class DoctorProfileRead(BaseModel):
    id: int
    specialty_id: int
    specialty_name: Optional[str] = None
    bio: Optional[str] = None
    license_number: Optional[str] = None
    years_experience: Optional[int] = None

    model_config = {"from_attributes": True}


class PatientProfileRead(BaseModel):
    id: int
    date_of_birth: Optional[date] = None
    blood_type: Optional[str] = None
    allergies: Optional[str] = None
    fiscal_code: Optional[str] = None

    model_config = {"from_attributes": True}


class UserWithProfile(UserRead):
    doctor_profile: Optional[DoctorProfileRead] = None
    patient_profile: Optional[PatientProfileRead] = None
