import asyncio
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.specialty import Specialty

SPECIALTIES = [
    {"name": "Dermatologia", "description": "Malattie della pelle"},
    {"name": "Odontoiatria", "description": "Salute dentale e orale"},
    {"name": "Cardiologia", "description": "Malattie del cuore"},
    {"name": "Ortopedia", "description": "Apparato muscolo-scheletrico"},
    {"name": "Neurologia", "description": "Sistema nervoso"},
    {"name": "Oftalmologia", "description": "Malattie degli occhi"},
    {"name": "Pediatria", "description": "Medicina per bambini e adolescenti"},
    {"name": "Ginecologia", "description": "Salute riproduttiva femminile"},
    {"name": "Urologia", "description": "Apparato urinario"},
    {"name": "Psichiatria", "description": "Salute mentale"},
    {"name": "Medicina Generale", "description": "Medicina di base e cure primarie"},
    {"name": "Endocrinologia", "description": "Ghiandole e ormoni"},
    {"name": "Gastroenterologia", "description": "Apparato digerente"},
    {"name": "Oncologia", "description": "Diagnosi e cura dei tumori"},
    {"name": "Reumatologia", "description": "Malattie autoimmuni e articolari"},
]


async def seed():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Specialty).limit(1))
        if result.scalar_one_or_none():
            return

        for s in SPECIALTIES:
            db.add(Specialty(**s))
        await db.commit()
        print(f"Seeded {len(SPECIALTIES)} specialties.")


if __name__ == "__main__":
    asyncio.run(seed())
