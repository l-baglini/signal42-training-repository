import uuid
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.appointment import Appointment, AppointmentStatus
from app.models.medical_record import MedicalRecordEntry
from app.models.doctor import Doctor
from app.models.patient import Patient
from app.models.specialty import Specialty
from app.models.user import User
from app.schemas.medical_record import (
    MedicalRecordEntryCreate, MedicalRecordEntryUpdate,
    MedicalRecordEntryRead, PatientMedicalRecord, SpecialtyGroup, DoctorBriefRecord,
)
from app.dependencies.auth import get_current_user, get_current_doctor
from app.dependencies.permissions import check_doctor_can_access_patient, check_doctor_can_edit_entry

router = APIRouter(tags=["medical_records"])


def _entry_to_read(entry: MedicalRecordEntry, appt_type=None) -> MedicalRecordEntryRead:
    doctor_brief = None
    if entry.doctor and entry.doctor.user:
        doctor_brief = DoctorBriefRecord(
            id=entry.doctor.id,
            first_name=entry.doctor.user.first_name,
            last_name=entry.doctor.user.last_name,
        )
    return MedicalRecordEntryRead(
        id=entry.id,
        appointment_id=entry.appointment_id,
        appointment_type=appt_type or (entry.appointment.appointment_type if entry.appointment else None),
        entry_date=entry.entry_date,
        title=entry.title,
        content=entry.content,
        attachments=entry.attachments,
        doctor=doctor_brief,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


def _entries_query():
    return (
        select(MedicalRecordEntry)
        .options(
            selectinload(MedicalRecordEntry.doctor).selectinload(Doctor.user),
            selectinload(MedicalRecordEntry.appointment),
            selectinload(MedicalRecordEntry.specialty),
        )
        .order_by(MedicalRecordEntry.entry_date.asc())
    )


@router.get("/patients/{patient_id}/medical-record", response_model=PatientMedicalRecord)
async def get_patient_medical_record(
    patient_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    patient_result = await db.execute(
        select(Patient).where(Patient.id == patient_id).options(selectinload(Patient.user))
    )
    patient = patient_result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    if user.role.value == "patient":
        if not user.patient_profile or user.patient_profile.id != patient_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    else:
        if not user.doctor_profile:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        await check_doctor_can_access_patient(user.doctor_profile, patient_id, db)

    result = await db.execute(
        _entries_query().where(MedicalRecordEntry.patient_id == patient_id)
    )
    entries = result.scalars().all()

    by_specialty: dict[int, dict] = {}
    for entry in entries:
        sid = entry.specialty_id
        if sid not in by_specialty:
            by_specialty[sid] = {
                "specialty_id": sid,
                "specialty_name": entry.specialty.name if entry.specialty else "",
                "entries": [],
            }
        by_specialty[sid]["entries"].append(_entry_to_read(entry))

    return PatientMedicalRecord(
        patient_id=patient.id,
        first_name=patient.user.first_name,
        last_name=patient.user.last_name,
        specialties=[SpecialtyGroup(**v) for v in by_specialty.values()],
    )


@router.get("/patients/{patient_id}/medical-record/specialty/{specialty_id}", response_model=PatientMedicalRecord)
async def get_patient_medical_record_by_specialty(
    patient_id: int,
    specialty_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    patient_result = await db.execute(
        select(Patient).where(Patient.id == patient_id).options(selectinload(Patient.user))
    )
    patient = patient_result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    if user.role.value == "patient":
        if not user.patient_profile or user.patient_profile.id != patient_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    else:
        if not user.doctor_profile:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        await check_doctor_can_access_patient(user.doctor_profile, patient_id, db)

    result = await db.execute(
        _entries_query().where(
            and_(MedicalRecordEntry.patient_id == patient_id, MedicalRecordEntry.specialty_id == specialty_id)
        )
    )
    entries = result.scalars().all()

    specialty_name = entries[0].specialty.name if entries else ""
    groups = []
    if entries:
        groups = [SpecialtyGroup(
            specialty_id=specialty_id,
            specialty_name=specialty_name,
            entries=[_entry_to_read(e) for e in entries],
        )]

    return PatientMedicalRecord(
        patient_id=patient.id,
        first_name=patient.user.first_name,
        last_name=patient.user.last_name,
        specialties=groups,
    )


@router.post("/appointments/{appointment_id}/medical-record-entry", response_model=MedicalRecordEntryRead, status_code=status.HTTP_201_CREATED)
async def create_medical_record_entry(
    appointment_id: uuid.UUID,
    data: MedicalRecordEntryCreate,
    doctor: Doctor = Depends(get_current_doctor),
    db: AsyncSession = Depends(get_db),
):
    appt_result = await db.execute(
        select(Appointment)
        .where(Appointment.id == appointment_id)
        .options(selectinload(Appointment.slot))
    )
    appt = appt_result.scalar_one_or_none()
    if not appt or appt.doctor_id != doctor.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Appointment not found or access denied")
    if appt.status != AppointmentStatus.completed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Appointment must be completed before adding a record entry")

    existing = await db.execute(
        select(MedicalRecordEntry).where(MedicalRecordEntry.appointment_id == appointment_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Medical record entry already exists for this appointment")

    entry = MedicalRecordEntry(
        patient_id=appt.patient_id,
        doctor_id=doctor.id,
        appointment_id=appointment_id,
        specialty_id=doctor.specialty_id,
        entry_date=appt.slot.start_datetime if appt.slot else datetime.utcnow(),
        title=data.title,
        content=data.content,
        attachments=data.attachments or [],
        created_by_doctor_id=doctor.id,
    )
    db.add(entry)
    await db.commit()

    result = await db.execute(_entries_query().where(MedicalRecordEntry.id == entry.id))
    entry = result.scalar_one()
    return _entry_to_read(entry)


@router.put("/medical-record-entries/{entry_id}", response_model=MedicalRecordEntryRead)
async def update_medical_record_entry(
    entry_id: uuid.UUID,
    data: MedicalRecordEntryUpdate,
    doctor: Doctor = Depends(get_current_doctor),
    db: AsyncSession = Depends(get_db),
):
    entry = await check_doctor_can_edit_entry(doctor, entry_id, db)

    if data.title is not None:
        entry.title = data.title
    if data.content is not None:
        entry.content = data.content
    if data.attachments is not None:
        entry.attachments = data.attachments
    entry.updated_at = datetime.utcnow()

    await db.commit()
    result = await db.execute(_entries_query().where(MedicalRecordEntry.id == entry_id))
    entry = result.scalar_one()
    return _entry_to_read(entry)
