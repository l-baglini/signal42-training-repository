import uuid
from datetime import date

from sqlalchemy import String, Text, Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    blood_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    allergies: Mapped[str | None] = mapped_column(Text, nullable=True)
    fiscal_code: Mapped[str | None] = mapped_column(String(50), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="patient_profile")
    appointments: Mapped[list["Appointment"]] = relationship("Appointment", back_populates="patient")
    medical_record_entries: Mapped[list["MedicalRecordEntry"]] = relationship("MedicalRecordEntry", back_populates="patient")
