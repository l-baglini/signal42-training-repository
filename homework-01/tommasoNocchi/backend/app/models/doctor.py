import uuid

from sqlalchemy import String, Text, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class Doctor(Base):
    __tablename__ = "doctors"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    specialty_id: Mapped[int] = mapped_column(Integer, ForeignKey("specialties.id"), nullable=False)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    license_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    years_experience: Mapped[int | None] = mapped_column(Integer, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="doctor_profile")
    specialty: Mapped["Specialty"] = relationship("Specialty", back_populates="doctors")
    slots: Mapped[list["Slot"]] = relationship("Slot", back_populates="doctor")
    appointments: Mapped[list["Appointment"]] = relationship("Appointment", back_populates="doctor")
    medical_record_entries: Mapped[list["MedicalRecordEntry"]] = relationship("MedicalRecordEntry", back_populates="doctor", foreign_keys="MedicalRecordEntry.doctor_id")
    created_entries: Mapped[list["MedicalRecordEntry"]] = relationship("MedicalRecordEntry", back_populates="created_by_doctor", foreign_keys="MedicalRecordEntry.created_by_doctor_id")
