from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Specialty(Base):
    __tablename__ = "specialties"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    doctors: Mapped[list["Doctor"]] = relationship("Doctor", back_populates="specialty")
    medical_record_entries: Mapped[list["MedicalRecordEntry"]] = relationship("MedicalRecordEntry", back_populates="specialty")
