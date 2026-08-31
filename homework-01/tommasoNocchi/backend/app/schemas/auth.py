from datetime import date
from typing import Optional

from pydantic import BaseModel, EmailStr

from app.models.user import UserRole
from app.schemas.user import UserWithProfile


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    role: UserRole
    first_name: str
    last_name: str
    phone: Optional[str] = None
    # Doctor fields
    specialty_id: Optional[int] = None
    license_number: Optional[str] = None
    bio: Optional[str] = None
    years_experience: Optional[int] = None
    # Patient fields
    date_of_birth: Optional[date] = None
    blood_type: Optional[str] = None
    fiscal_code: Optional[str] = None
    allergies: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserWithProfile


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str
