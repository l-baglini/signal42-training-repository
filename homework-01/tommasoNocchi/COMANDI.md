# Docker Commands — MediClinic

## Stop containers (without deleting the database)

```bash
docker compose down
```

## Start containers (without rebuild)

```bash
docker compose up -d
```

## Start with image rebuild (after code changes)

```bash
docker compose up --build -d
```

## Stream logs in real time

```bash
docker compose logs -f
```

```bash
# Backend only
docker compose logs backend -f
```
