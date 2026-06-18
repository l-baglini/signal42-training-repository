from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User, UserRole
from app.models.doctor import Doctor
from app.models.patient import Patient
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, AccessTokenResponse, RefreshRequest, LogoutRequest
from app.schemas.user import UserWithProfile, DoctorProfileRead, PatientProfileRead
from app.services.auth_service import (
    get_user_by_email, create_user_with_profile, verify_password,
    create_access_token, create_refresh_token_value,
    save_refresh_token, get_refresh_token, revoke_refresh_token,
    decode_access_token,
)
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


def build_user_with_profile(user: User) -> UserWithProfile:
    doctor_data = None
    if user.doctor_profile:
        dp = user.doctor_profile
        doctor_data = DoctorProfileRead(
            id=dp.id,
            specialty_id=dp.specialty_id,
            specialty_name=dp.specialty.name if dp.specialty else None,
            bio=dp.bio,
            license_number=dp.license_number,
            years_experience=dp.years_experience,
        )
    patient_data = None
    if user.patient_profile:
        pp = user.patient_profile
        patient_data = PatientProfileRead(
            id=pp.id,
            date_of_birth=pp.date_of_birth,
            blood_type=pp.blood_type,
            allergies=pp.allergies,
            fiscal_code=pp.fiscal_code,
        )
    return UserWithProfile(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        phone=user.phone,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        doctor_profile=doctor_data,
        patient_profile=patient_data,
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await get_user_by_email(db, data.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    if data.role == UserRole.doctor and not data.specialty_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="specialty_id is required for doctors")

    user = await create_user_with_profile(db, data.model_dump())

    result = await db.execute(
        select(User)
        .where(User.id == user.id)
        .options(
            selectinload(User.doctor_profile).selectinload(Doctor.specialty),
            selectinload(User.patient_profile),
        )
    )
    user = result.scalar_one()

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token_value()
    await save_refresh_token(db, user.id, refresh_token)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=build_user_with_profile(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, data.email)
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account inactive")

    result = await db.execute(
        select(User)
        .where(User.id == user.id)
        .options(
            selectinload(User.doctor_profile).selectinload(Doctor.specialty),
            selectinload(User.patient_profile),
        )
    )
    user = result.scalar_one()

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token_value()
    await save_refresh_token(db, user.id, refresh_token)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=build_user_with_profile(user),
    )


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    rt = await get_refresh_token(db, data.refresh_token)
    if not rt or rt.revoked or rt.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    access_token = create_access_token(str(rt.user_id))
    return AccessTokenResponse(access_token=access_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(data: LogoutRequest, db: AsyncSession = Depends(get_db)):
    await revoke_refresh_token(db, data.refresh_token)


@router.get("/me", response_model=UserWithProfile)
async def me(user: User = Depends(get_current_user)):
    return build_user_with_profile(user)
