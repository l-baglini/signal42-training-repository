# MediClinic

A management application for a multi-specialty medical clinic.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind + shadcn/ui |
| State | Zustand + TanStack Query |
| Backend | FastAPI (Python 3.11) + SQLAlchemy 2 async |
| Database | PostgreSQL 16 |
| Auth | JWT (access + refresh token) + bcrypt |
| Infra | Docker + Docker Compose + Nginx |

## Prerequisites

- **Docker Engine** ≥ 24 or **Docker Desktop** (Mac/Windows)
- `docker compose` (included in Docker Desktop; on Linux: `sudo apt install docker-compose-plugin`)

## Quick Start

```bash
# 1. Clone the repository
git clone <REPO_URL>
cd mediclinic

# 2. Configure environment variables
cp .env.example .env
# Open .env and set:
#   DB_PASSWORD=a_secure_password
#   SECRET_KEY=$(openssl rand -hex 32)
#   LAN_IP=<server_LAN_IP>  (e.g. 192.168.1.100)

# 3. Start everything
docker compose up --build -d

# 4. Open in browser
#   From the server:   http://localhost
#   From other PCs:    http://<LAN_IP>
```

On first startup, Alembic runs migrations and seeds the medical specialties automatically.

## Finding Your LAN IP

```bash
# Linux/Mac
ip addr show | grep 'inet ' | grep -v 127.0.0.1

# Windows
ipconfig | findstr IPv4
```

## Useful Commands

```bash
# Stream logs in real time
docker compose logs -f

# Backend logs only
docker compose logs -f backend

# Stop all containers
docker compose down

# Stop and delete all data (WARNING: deletes the DB)
docker compose down -v

# Restart after code changes
docker compose up --build -d

# Connect to the database directly
docker compose exec postgres psql -U mediclinic_user -d mediclinic

# Run migrations manually
docker compose exec backend alembic upgrade head
```

## Users and Access

### Roles
- **Patient**: registration, booking visits/procedures, viewing medical record
- **Doctor**: managing availability slots, managing appointments, writing clinical notes

### Registration
Navigate to `/register` and select a role. There is no default admin account — the first doctor and patient are created via the registration form.

## API Documentation

With the backend running, OpenAPI documentation is available at:
- Swagger UI: `http://localhost/api/docs`
- ReDoc: `http://localhost/api/redoc`

## Architecture

```
Browser → Nginx (:80)
              ├── /api/* → FastAPI (backend:8000)
              └── /*     → React SPA (static files)
```

## Features

### Patient
- Registration with personal information
- Booking visits (specialty → doctor → slot selection)
- Booking procedures
- Managing and cancelling appointments
- Viewing full medical record grouped by specialty

### Doctor
- Registration with specialty and license
- Managing availability slots (create, update, delete, weekly repeat)
- Managing appointments (complete, cancel)
- Writing clinical notes for completed appointments
- Access to patients' medical records (only if at least one completed appointment exists)

## Security Notes

- Always change `DB_PASSWORD` and `SECRET_KEY` in production
- `SECRET_KEY` should be generated with `openssl rand -hex 32`
- In production, set `CORS_ORIGINS` to specific LAN IPs instead of `["*"]`
- Refresh tokens are stored in the DB and revoked on logout
