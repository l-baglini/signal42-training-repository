import uuid
from datetime import datetime
from typing import Optional, Any

from pydantic import BaseModel

from app.models.appointment import AppointmentType


class MedicalRecordEntryCreate(BaseModel):
    title: str
    content: str
    attachments: Optional[list[Any]] = None


class MedicalRecordEntryUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    attachments: Optional[list[Any]] = None


class DoctorBriefRecord(BaseModel):
    id: int
    first_name: str
    last_name: str

    model_config = {"from_attributes": True}


class MedicalRecordEntryRead(BaseModel):
    id: uuid.UUID
    appointment_id: uuid.UUID
    appointment_type: Optional[AppointmentType] = None
    entry_date: datetime
    title: str
    content: str
    attachments: Optional[list[Any]] = None
    doctor: Optional[DoctorBriefRecord] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SpecialtyGroup(BaseModel):
    specialty_id: int
    specialty_name: str
    entries: list[MedicalRecordEntryRead]


class PatientMedicalRecord(BaseModel):
    patient_id: int
    first_name: str
    last_name: str
    specialties: list[SpecialtyGroup]
