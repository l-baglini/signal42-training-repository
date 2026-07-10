from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import auth, slots, appointments, medical_records, doctors, patients

app = FastAPI(title="MediClinic API", version="1.0.0", docs_url="/api/docs", redoc_url="/api/redoc")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(auth.router, prefix="/api/v1")
app.include_router(slots.router, prefix="/api/v1")
app.include_router(appointments.router, prefix="/api/v1")
app.include_router(medical_records.router, prefix="/api/v1")
app.include_router(doctors.router, prefix="/api/v1")
app.include_router(patients.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/v1/health")
async def api_health():
    return {"status": "ok"}
