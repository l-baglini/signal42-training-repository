from typing import Optional
from pydantic import BaseModel


class SpecialtyRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class DoctorPublic(BaseModel):
    id: int
    first_name: str
    last_name: str
    specialty: SpecialtyRead
    bio: Optional[str] = None
    years_experience: Optional[int] = None

    model_config = {"from_attributes": True}
