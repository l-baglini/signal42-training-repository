import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.appointment import AppointmentStatus, AppointmentType
from app.models.slot import SlotType
from app.schemas.slot import SlotRead


class AppointmentCreate(BaseModel):
    slot_id: int
    appointment_type: AppointmentType
    reason: Optional[str] = None


class AppointmentCancel(BaseModel):
    cancellation_reason: Optional[str] = None


class DoctorBrief(BaseModel):
    id: int
    first_name: str
    last_name: str
    specialty_name: Optional[str] = None

    model_config = {"from_attributes": True}


class PatientBrief(BaseModel):
    id: int
    first_name: str
    last_name: str

    model_config = {"from_attributes": True}


class AppointmentRead(BaseModel):
    id: uuid.UUID
    patient_id: int
    doctor_id: int
    slot_id: int
    appointment_type: AppointmentType
    status: AppointmentStatus
    reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    cancellation_reason: Optional[str] = None
    slot: Optional[SlotRead] = None
    doctor: Optional[DoctorBrief] = None
    patient: Optional[PatientBrief] = None

    model_config = {"from_attributes": True}
