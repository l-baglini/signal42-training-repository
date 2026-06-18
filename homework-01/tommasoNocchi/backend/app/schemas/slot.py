from datetime import datetime
from typing import Optional

from pydantic import BaseModel, model_validator

from app.models.slot import SlotType


class SlotCreate(BaseModel):
    start_datetime: datetime
    end_datetime: datetime
    slot_type: SlotType
    duration_minutes: int

    @model_validator(mode="after")
    def validate_datetimes(self):
        if self.start_datetime >= self.end_datetime:
            raise ValueError("start_datetime must be before end_datetime")
        return self


class SlotUpdate(BaseModel):
    start_datetime: Optional[datetime] = None
    end_datetime: Optional[datetime] = None
    slot_type: Optional[SlotType] = None
    duration_minutes: Optional[int] = None


class SlotRead(BaseModel):
    id: int
    doctor_id: int
    start_datetime: datetime
    end_datetime: datetime
    slot_type: SlotType
    is_available: bool
    duration_minutes: int

    model_config = {"from_attributes": True}
