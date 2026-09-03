from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.patient import Patient
from app.models.appointment import Appointment, AppointmentStatus
from app.models.doctor import Doctor
from app.models.user import User
from app.dependencies.auth import get_current_doctor

router = APIRouter(tags=["patients"])


@router.get("/patients/{patient_id}/appointments-summary")
async def get_patient_appointments_summary(
    patient_id: int,
    doctor: Doctor = Depends(get_current_doctor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Appointment)
        .where(
            and_(
                Appointment.doctor_id == doctor.id,
                Appointment.patient_id == patient_id,
                Appointment.status == AppointmentStatus.completed,
            )
        )
        .options(selectinload(Appointment.slot))
    )
    appts = result.scalars().all()

    patient_result = await db.execute(
        select(Patient).where(Patient.id == patient_id).options(selectinload(Patient.user))
    )
    patient = patient_result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    return {
        "patient_id": patient_id,
        "first_name": patient.user.first_name,
        "last_name": patient.user.last_name,
        "completed_appointments_count": len(appts),
        "can_access_record": len(appts) > 0,
    }
