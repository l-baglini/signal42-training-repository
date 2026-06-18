import uuid
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User, UserRole
from app.models.doctor import Doctor
from app.models.patient import Patient
from app.services.auth_service import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    user_id = decode_access_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    result = await db.execute(
        select(User)
        .where(User.id == uuid.UUID(user_id))
        .options(
            selectinload(User.doctor_profile).selectinload(Doctor.specialty),
            selectinload(User.patient_profile),
        )
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


async def get_current_doctor(user: User = Depends(get_current_user)) -> Doctor:
    if user.role != UserRole.doctor or not user.doctor_profile:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctor access required")
    return user.doctor_profile


async def get_current_patient(user: User = Depends(get_current_user)) -> Patient:
    if user.role != UserRole.patient or not user.patient_profile:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient access required")
    return user.patient_profile
