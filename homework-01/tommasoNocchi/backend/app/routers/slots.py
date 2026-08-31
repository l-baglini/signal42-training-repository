from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.database import get_db
from app.models.slot import Slot
from app.models.appointment import Appointment, AppointmentStatus
from app.models.doctor import Doctor
from app.models.user import User
from app.schemas.slot import SlotCreate, SlotUpdate, SlotRead
from app.dependencies.auth import get_current_doctor, get_current_user

router = APIRouter(prefix="/slots", tags=["slots"])


def _naive(dt: datetime) -> datetime:
    """Converte un datetime timezone-aware in naive UTC, lascia naive invariato."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


async def _check_overlap(db: AsyncSession, doctor_id: int, start: datetime, end: datetime, exclude_id: Optional[int] = None):
    start, end = _naive(start), _naive(end)
    q = select(Slot).where(
        and_(
            Slot.doctor_id == doctor_id,
            Slot.start_datetime < end,
            Slot.end_datetime > start,
        )
    )
    if exclude_id:
        q = q.where(Slot.id != exclude_id)
    result = await db.execute(q)
    return result.scalar_one_or_none()


@router.get("/available", response_model=list[SlotRead])
async def get_available_slots(
    doctor_id: Optional[int] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(Slot).where(Slot.is_available == True)
    if doctor_id:
        q = q.where(Slot.doctor_id == doctor_id)
    if date_from:
        q = q.where(Slot.start_datetime >= _naive(date_from))
    if date_to:
        q = q.where(Slot.end_datetime <= _naive(date_to))
    if type:
        q = q.where(Slot.slot_type == type)
    q = q.order_by(Slot.start_datetime)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/my-slots", response_model=list[SlotRead])
async def get_my_slots(
    week: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    doctor: Doctor = Depends(get_current_doctor),
    db: AsyncSession = Depends(get_db),
):
    q = select(Slot).where(Slot.doctor_id == doctor.id).order_by(Slot.start_datetime)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/", response_model=SlotRead, status_code=status.HTTP_201_CREATED)
async def create_slot(
    data: SlotCreate,
    doctor: Doctor = Depends(get_current_doctor),
    db: AsyncSession = Depends(get_db),
):
    start = _naive(data.start_datetime)
    end = _naive(data.end_datetime)

    if start < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Slot cannot start in the past")

    overlap = await _check_overlap(db, doctor.id, start, end)
    if overlap:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Overlapping slot exists")

    slot = Slot(
        doctor_id=doctor.id,
        start_datetime=start,
        end_datetime=end,
        slot_type=data.slot_type,
        duration_minutes=data.duration_minutes,
    )
    db.add(slot)
    await db.commit()
    await db.refresh(slot)
    return slot


@router.put("/{slot_id}", response_model=SlotRead)
async def update_slot(
    slot_id: int,
    data: SlotUpdate,
    doctor: Doctor = Depends(get_current_doctor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Slot).where(Slot.id == slot_id))
    slot = result.scalar_one_or_none()
    if not slot or slot.doctor_id != doctor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slot not found")

    appt_result = await db.execute(
        select(Appointment).where(
            and_(Appointment.slot_id == slot_id, Appointment.status == AppointmentStatus.scheduled)
        )
    )
    if appt_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot modify slot with active appointment")

    if data.start_datetime:
        slot.start_datetime = _naive(data.start_datetime)
    if data.end_datetime:
        slot.end_datetime = _naive(data.end_datetime)
    if data.slot_type:
        slot.slot_type = data.slot_type
    if data.duration_minutes:
        slot.duration_minutes = data.duration_minutes

    overlap = await _check_overlap(db, doctor.id, slot.start_datetime, slot.end_datetime, exclude_id=slot_id)
    if overlap:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Overlapping slot exists")

    await db.commit()
    await db.refresh(slot)
    return slot


@router.delete("/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_slot(
    slot_id: int,
    doctor: Doctor = Depends(get_current_doctor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Slot).where(Slot.id == slot_id))
    slot = result.scalar_one_or_none()
    if not slot or slot.doctor_id != doctor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slot not found")

    appt_result = await db.execute(
        select(Appointment).where(
            and_(Appointment.slot_id == slot_id, Appointment.status == AppointmentStatus.scheduled)
        )
    )
    if appt_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot delete slot with active appointment")

    await db.delete(slot)
    await db.commit()
