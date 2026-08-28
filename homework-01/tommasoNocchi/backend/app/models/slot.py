from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, Boolean, Integer, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SlotType(str, Enum):
    visit = "visit"
    procedure = "procedure"


class Slot(Base):
    __tablename__ = "slots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    doctor_id: Mapped[int] = mapped_column(Integer, ForeignKey("doctors.id"), nullable=False)
    start_datetime: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_datetime: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    slot_type: Mapped[SlotType] = mapped_column(SAEnum(SlotType), nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)

    doctor: Mapped["Doctor"] = relationship("Doctor", back_populates="slots")
    appointment: Mapped["Appointment | None"] = relationship("Appointment", back_populates="slot", uselist=False)
