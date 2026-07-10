import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models.appointment import Appointment, AppointmentStatus
from app.models.medical_record import MedicalRecordEntry
from app.models.doctor import Doctor
from app.models.patient import Patient


async def check_patient_owns_appointment(patient: Patient, appointment_id: uuid.UUID, db: AsyncSession) -> Appointment:
    result = await db.execute(
        select(Appointment).where(
            and_(Appointment.id == appointment_id, Appointment.patient_id == patient.id)
        )
    )
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Appointment not found or access denied")
    return appt


async def check_doctor_owns_appointment(doctor: Doctor, appointment_id: uuid.UUID, db: AsyncSession) -> Appointment:
    result = await db.execute(
        select(Appointment).where(
            and_(Appointment.id == appointment_id, Appointment.doctor_id == doctor.id)
        )
    )
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Appointment not found or access denied")
    return appt


async def check_doctor_can_access_patient(doctor: Doctor, patient_id: int, db: AsyncSession) -> None:
    result = await db.execute(
        select(Appointment).where(
            and_(
                Appointment.doctor_id == doctor.id,
                Appointment.patient_id == patient_id,
                Appointment.status == AppointmentStatus.completed,
            )
        ).limit(1)
    )
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No completed appointments with this patient — access denied",
        )


async def check_doctor_can_edit_entry(doctor: Doctor, entry_id: uuid.UUID, db: AsyncSession) -> MedicalRecordEntry:
    result = await db.execute(
        select(MedicalRecordEntry).where(MedicalRecordEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    if entry.created_by_doctor_id != doctor.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the creating doctor can edit this entry")
    return entry
