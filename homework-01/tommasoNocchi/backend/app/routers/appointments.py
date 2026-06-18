import uuid
from datetime import datetime, timezone
from typing import Optional


def _naive(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.models.slot import Slot
from app.models.doctor import Doctor
from app.models.patient import Patient
from app.models.specialty import Specialty
from app.models.user import User
from app.schemas.appointment import AppointmentCreate, AppointmentCancel, AppointmentRead, DoctorBrief, PatientBrief
from app.schemas.slot import SlotRead
from app.dependencies.auth import get_current_user, get_current_patient, get_current_doctor

router = APIRouter(prefix="/appointments", tags=["appointments"])


def _build_appt_read(appt: Appointment) -> AppointmentRead:
    doctor_brief = None
    if appt.doctor and appt.doctor.user:
        specialty_name = appt.doctor.specialty.name if appt.doctor.specialty else None
        doctor_brief = DoctorBrief(
            id=appt.doctor.id,
            first_name=appt.doctor.user.first_name,
            last_name=appt.doctor.user.last_name,
            specialty_name=specialty_name,
        )
    patient_brief = None
    if appt.patient and appt.patient.user:
        patient_brief = PatientBrief(
            id=appt.patient.id,
            first_name=appt.patient.user.first_name,
            last_name=appt.patient.user.last_name,
        )
    slot_read = None
    if appt.slot:
        slot_read = SlotRead.model_validate(appt.slot)

    return AppointmentRead(
        id=appt.id,
        patient_id=appt.patient_id,
        doctor_id=appt.doctor_id,
        slot_id=appt.slot_id,
        appointment_type=appt.appointment_type,
        status=appt.status,
        reason=appt.reason,
        notes=appt.notes,
        created_at=appt.created_at,
        updated_at=appt.updated_at,
        cancellation_reason=appt.cancellation_reason,
        slot=slot_read,
        doctor=doctor_brief,
        patient=patient_brief,
    )


def _appt_query_with_joins():
    return (
        select(Appointment)
        .options(
            selectinload(Appointment.slot),
            selectinload(Appointment.doctor).selectinload(Doctor.user),
            selectinload(Appointment.doctor).selectinload(Doctor.specialty),
            selectinload(Appointment.patient).selectinload(Patient.user),
        )
    )


@router.post("/", response_model=AppointmentRead, status_code=status.HTTP_201_CREATED)
async def book_appointment(
    data: AppointmentCreate,
    patient: Patient = Depends(get_current_patient),
    db: AsyncSession = Depends(get_db),
):
    async with db.begin_nested():
        slot_result = await db.execute(
            select(Slot).where(Slot.id == data.slot_id).with_for_update()
        )
        slot = slot_result.scalar_one_or_none()
        if not slot:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slot not found")
        if not slot.is_available:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slot is not available")

        existing = await db.execute(
            select(Appointment).where(
                and_(Appointment.slot_id == data.slot_id, Appointment.status == AppointmentStatus.scheduled)
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slot already booked")

        appt = Appointment(
            patient_id=patient.id,
            doctor_id=slot.doctor_id,
            slot_id=slot.id,
            appointment_type=data.appointment_type,
            status=AppointmentStatus.scheduled,
            reason=data.reason,
        )
        db.add(appt)
        slot.is_available = False

    await db.commit()

    result = await db.execute(
        _appt_query_with_joins().where(Appointment.id == appt.id)
    )
    appt = result.scalar_one()
    return _build_appt_read(appt)


@router.get("/my-appointments", response_model=list[AppointmentRead])
async def get_my_appointments(
    appt_status: Optional[str] = Query(None, alias="status"),
    type: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = _appt_query_with_joins()

    if user.role.value == "patient":
        patient = user.patient_profile
        if not patient:
            return []
        q = q.where(Appointment.patient_id == patient.id)
    else:
        doctor = user.doctor_profile
        if not doctor:
            return []
        q = q.where(Appointment.doctor_id == doctor.id)

    if appt_status:
        q = q.where(Appointment.status == appt_status)
    if type:
        q = q.where(Appointment.appointment_type == type)
    if date_from:
        q = q.join(Appointment.slot).where(Slot.start_datetime >= _naive(date_from))
    if date_to:
        q = q.join(Appointment.slot).where(Slot.end_datetime <= _naive(date_to))

    q = q.order_by(Appointment.created_at.desc())
    result = await db.execute(q)
    appts = result.scalars().all()
    return [_build_appt_read(a) for a in appts]


@router.get("/{appointment_id}", response_model=AppointmentRead)
async def get_appointment(
    appointment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        _appt_query_with_joins().where(Appointment.id == appointment_id)
    )
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")

    if user.role.value == "patient":
        if not user.patient_profile or appt.patient_id != user.patient_profile.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    else:
        if not user.doctor_profile or appt.doctor_id != user.doctor_profile.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return _build_appt_read(appt)


@router.put("/{appointment_id}/cancel", response_model=AppointmentRead)
async def cancel_appointment(
    appointment_id: uuid.UUID,
    data: AppointmentCancel,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        _appt_query_with_joins().where(Appointment.id == appointment_id)
    )
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")

    if user.role.value == "patient":
        if not user.patient_profile or appt.patient_id != user.patient_profile.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        if appt.status != AppointmentStatus.scheduled:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only scheduled appointments can be cancelled by patient")
    else:
        if not user.doctor_profile or appt.doctor_id != user.doctor_profile.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        if appt.status in (AppointmentStatus.completed, AppointmentStatus.cancelled):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot cancel a completed or already cancelled appointment")

    appt.status = AppointmentStatus.cancelled
    appt.cancelled_by_id = user.id
    appt.cancellation_reason = data.cancellation_reason
    appt.updated_at = datetime.utcnow()

    slot_result = await db.execute(select(Slot).where(Slot.id == appt.slot_id))
    slot = slot_result.scalar_one_or_none()
    if slot:
        slot.is_available = True

    await db.commit()
    await db.refresh(appt)
    result = await db.execute(_appt_query_with_joins().where(Appointment.id == appt.id))
    appt = result.scalar_one()
    return _build_appt_read(appt)


@router.put("/{appointment_id}/complete", response_model=AppointmentRead)
async def complete_appointment(
    appointment_id: uuid.UUID,
    doctor: Doctor = Depends(get_current_doctor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        _appt_query_with_joins().where(Appointment.id == appointment_id)
    )
    appt = result.scalar_one_or_none()
    if not appt or appt.doctor_id != doctor.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Appointment not found or access denied")
    if appt.status != AppointmentStatus.scheduled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only scheduled appointments can be completed")

    appt.status = AppointmentStatus.completed
    appt.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(appt)
    result = await db.execute(_appt_query_with_joins().where(Appointment.id == appt.id))
    appt = result.scalar_one()
    return _build_appt_read(appt)
