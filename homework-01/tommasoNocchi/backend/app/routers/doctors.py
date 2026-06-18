from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.doctor import Doctor
from app.models.slot import Slot


def _naive(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt
from app.models.specialty import Specialty
from app.models.user import User
from app.schemas.doctor import DoctorPublic, SpecialtyRead
from app.schemas.slot import SlotRead
from datetime import datetime

router = APIRouter(tags=["doctors"])


def _doctor_to_public(doctor: Doctor) -> DoctorPublic:
    return DoctorPublic(
        id=doctor.id,
        first_name=doctor.user.first_name,
        last_name=doctor.user.last_name,
        specialty=SpecialtyRead(
            id=doctor.specialty.id,
            name=doctor.specialty.name,
            description=doctor.specialty.description,
        ),
        bio=doctor.bio,
        years_experience=doctor.years_experience,
    )


@router.get("/specialties", response_model=list[SpecialtyRead])
async def list_specialties(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Specialty).order_by(Specialty.name))
    return result.scalars().all()


@router.get("/doctors", response_model=list[DoctorPublic])
async def list_doctors(
    specialty_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Doctor)
        .options(selectinload(Doctor.user), selectinload(Doctor.specialty))
        .join(Doctor.user)
        .where(User.is_active == True)
    )
    if specialty_id:
        q = q.where(Doctor.specialty_id == specialty_id)
    result = await db.execute(q)
    doctors = result.scalars().all()
    return [_doctor_to_public(d) for d in doctors]


@router.get("/doctors/{doctor_id}", response_model=DoctorPublic)
async def get_doctor(doctor_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Doctor)
        .where(Doctor.id == doctor_id)
        .options(selectinload(Doctor.user), selectinload(Doctor.specialty))
    )
    doctor = result.scalar_one_or_none()
    if not doctor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")
    return _doctor_to_public(doctor)


@router.get("/doctors/{doctor_id}/slots", response_model=list[SlotRead])
async def get_doctor_slots(
    doctor_id: int,
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(Slot).where(and_(Slot.doctor_id == doctor_id, Slot.is_available == True))
    if date_from:
        q = q.where(Slot.start_datetime >= _naive(date_from))
    if date_to:
        q = q.where(Slot.end_datetime <= _naive(date_to))
    if type:
        q = q.where(Slot.slot_type == type)
    q = q.order_by(Slot.start_datetime)
    result = await db.execute(q)
    return result.scalars().all()
