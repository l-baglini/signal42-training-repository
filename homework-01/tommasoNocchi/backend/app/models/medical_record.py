import uuid
from datetime import datetime

from sqlalchemy import Text, DateTime, String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import Base


class MedicalRecordEntry(Base):
    __tablename__ = "medical_record_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[int] = mapped_column(Integer, ForeignKey("patients.id"), nullable=False)
    doctor_id: Mapped[int] = mapped_column(Integer, ForeignKey("doctors.id"), nullable=False)
    appointment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("appointments.id"), unique=True, nullable=False)
    specialty_id: Mapped[int] = mapped_column(Integer, ForeignKey("specialties.id"), nullable=False)
    entry_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    attachments: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by_doctor_id: Mapped[int] = mapped_column(Integer, ForeignKey("doctors.id"), nullable=False)

    patient: Mapped["Patient"] = relationship("Patient", back_populates="medical_record_entries")
    doctor: Mapped["Doctor"] = relationship("Doctor", back_populates="medical_record_entries", foreign_keys=[doctor_id])
    appointment: Mapped["Appointment"] = relationship("Appointment", back_populates="medical_record_entry")
    specialty: Mapped["Specialty"] = relationship("Specialty", back_populates="medical_record_entries")
    created_by_doctor: Mapped["Doctor"] = relationship("Doctor", back_populates="created_entries", foreign_keys=[created_by_doctor_id])
