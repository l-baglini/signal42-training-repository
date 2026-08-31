import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import String, Text, DateTime, ForeignKey, Enum as SAEnum, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class AppointmentStatus(str, Enum):
    scheduled = "scheduled"
    completed = "completed"
    cancelled = "cancelled"
    no_show = "no_show"


class AppointmentType(str, Enum):
    visit = "visit"
    procedure = "procedure"


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[int] = mapped_column(Integer, ForeignKey("patients.id"), nullable=False)
    doctor_id: Mapped[int] = mapped_column(Integer, ForeignKey("doctors.id"), nullable=False)
    slot_id: Mapped[int] = mapped_column(Integer, ForeignKey("slots.id"), unique=True, nullable=False)
    appointment_type: Mapped[AppointmentType] = mapped_column(SAEnum(AppointmentType), nullable=False)
    status: Mapped[AppointmentStatus] = mapped_column(SAEnum(AppointmentStatus), default=AppointmentStatus.scheduled, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    cancelled_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    patient: Mapped["Patient"] = relationship("Patient", back_populates="appointments")
    doctor: Mapped["Doctor"] = relationship("Doctor", back_populates="appointments")
    slot: Mapped["Slot"] = relationship("Slot", back_populates="appointment")
    cancelled_by: Mapped["User | None"] = relationship("User", foreign_keys=[cancelled_by_id])
    medical_record_entry: Mapped["MedicalRecordEntry | None"] = relationship("MedicalRecordEntry", back_populates="appointment", uselist=False)
