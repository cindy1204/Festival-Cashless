# Module 08 — Camping

**Difficulty:** ★★★ Advanced — recommended for teams of 4  
**Tests:** `node tests/run.mjs camping http://localhost:3000`

> Manage the tents in the camping zones during the festival days.

Read [CONVENTIONS.md](CONVENTIONS.md) first: the response format, pagination, and error codes apply to all modules.

## Tables

**Your team writes in** (and only in these):

### `reservas_camping`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `asistente_id` | int | yes |
| `zona_id` | int | yes |
| `fecha_entrada` | date | yes |
| `fecha_salida` | date | yes |
| `personas` | int | yes |
| `state` | varchar(20) | yes *(automatic)* |

**Read-only** (preloaded data or other modules): `asistentes`, `zonas`

## Endpoints

| Method | Route | Success |
|---|---|---|
| GET | `/api/reservas-camping` | 200 paginated |
| GET | `/api/reservas-camping/:id` | 200 |
| POST | `/api/reservas-camping` | 201 |
| PATCH | `/api/reservas-camping/:id` | 200 |
| DELETE | `/api/reservas-camping/:id` | 200 (logical delete) |
| GET | `/api/reservas-camping/zona/:zonaId/ocupacion` | 200 |

**List filters:** `?zona_id=`, `?asistente_id=`  
**Editable fields in PATCH:** `zona_id`, `fecha_entrada`, `fecha_salida`, `personas`. Sending any other field → 400.

### Create — `POST /api/reservas-camping`

```json
{
  "asistente_id": 7,
  "zona_id": 1,
  "fecha_entrada": "2026-11-20",
  "fecha_salida": "2026-11-22",
  "personas": 3
}
```

### Example — `GET /api/reservas-camping/1`

```json
{
  "data": {
    "id": 1,
    "asistente_id": 3,
    "zona_id": 2,
    "fecha_entrada": "2026-11-20",
    "fecha_salida": "2026-11-22",
    "personas": 2,
    "state": "ACTIVE"
  }
}
```

### `GET /api/reservas-camping/zona/:zonaId/ocupacion`

Capacity, occupied, and available. A zone that is not camping → 400; missing → 404.

```json
{
  "data": {
    "zona_id": 2,
    "capacidad": 2,
    "ocupadas": 2,
    "disponibles": 0
  }
}
```

## Validations → 400 / 404

- `asistente_id` and `zona_id` are required integers; if they do not exist → 404.
- Dates in `YYYY-MM-DD` format; `fecha_salida` must be later than `fecha_entrada`; both must be between **November 19 and 23, 2026**.
- `personas` is an integer between 1 and 6.
- The zone must be of type `CAMPING`; otherwise → 400.

## Business rules → 409

1. Only adults can camp: the attendee must be at least 18 years old on November 19, 2026 (someone who turns 18 that same day may also camp).
2. An attendee has **at most one** active camping reservation.
3. Each reservation occupies one tent; a zone cannot exceed its `capacidad`.

## Tips

- The rules live in the **use case** (`application/`), not in the controller. The use case queries the repository before deciding.
- Check the preloaded data table to see which records the tests use (section *Preloaded data* in CONVENTIONS.md) and **do not modify them manually**.
- Run the public tests continuously. Each red test tells you which request failed and what your API responded.
