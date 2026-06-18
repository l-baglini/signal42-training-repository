import uuid
from datetime import datetime, timedelta
from typing import Optional

from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.models.user import User, RefreshToken, UserRole
from app.models.doctor import Doctor
from app.models.patient import Patient

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": user_id, "exp": expire}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token_value() -> str:
    return str(uuid.uuid4())


def decode_access_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create_user_with_profile(db: AsyncSession, data: dict) -> User:
    role = data["role"]
    user = User(
        email=data["email"],
        hashed_password=hash_password(data["password"]),
        role=role,
        first_name=data["first_name"],
        last_name=data["last_name"],
        phone=data.get("phone"),
    )
    db.add(user)
    await db.flush()

    if role == UserRole.doctor:
        doctor = Doctor(
            user_id=user.id,
            specialty_id=data["specialty_id"],
            bio=data.get("bio"),
            license_number=data.get("license_number"),
            years_experience=data.get("years_experience"),
        )
        db.add(doctor)
    else:
        patient = Patient(
            user_id=user.id,
            date_of_birth=data.get("date_of_birth"),
            blood_type=data.get("blood_type"),
            fiscal_code=data.get("fiscal_code"),
            allergies=data.get("allergies"),
        )
        db.add(patient)

    await db.commit()
    await db.refresh(user)
    return user


async def save_refresh_token(db: AsyncSession, user_id: uuid.UUID, token: str) -> RefreshToken:
    rt = RefreshToken(
        token=token,
        user_id=user_id,
        expires_at=datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(rt)
    await db.commit()
    return rt


async def get_refresh_token(db: AsyncSession, token: str) -> Optional[RefreshToken]:
    result = await db.execute(select(RefreshToken).where(RefreshToken.token == token))
    return result.scalar_one_or_none()


async def revoke_refresh_token(db: AsyncSession, token: str) -> None:
    rt = await get_refresh_token(db, token)
    if rt:
        rt.revoked = True
        await db.commit()
