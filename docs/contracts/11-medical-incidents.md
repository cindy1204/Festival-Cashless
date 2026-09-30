# Module 11 — Medical incidents

**Difficulty:** ★★☆ Intermediate  
**Tests:** `node tests/run.mjs incidentes http://localhost:3000`

> Record and track medical attention during the festival.

Read [CONVENTIONS.md](CONVENTIONS.md) first: the response format, pagination, and error codes apply to all modules.

## Tables

**Your team writes in** (and only in these):

### `incidentes`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `asistente_id` | int | no |
| `zona_id` | int | yes |
| `dia_id` | int | yes |
| `severidad` | varchar(10) | yes |
| `descripcion` | varchar(500) | yes |
| `estado` | varchar(12) | yes |
| `state` | varchar(20) | yes *(automatic)* |

**Read-only** (preloaded data or other modules): `asistentes`, `zonas`, `dias`

## Endpoints

| Method | Route | Success |
|---|---|---|
| GET | `/api/incidentes` | 200 paginated |
| GET | `/api/incidentes/:id` | 200 |
| POST | `/api/incidentes` | 201 |
| PATCH | `/api/incidentes/:id` | 200 |
| DELETE | `/api/incidentes/:id` | 200 (logical delete) |
| PATCH | `/api/incidentes/:id/estado` | 200 |
| GET | `/api/incidentes/resumen?dia_id=1` | 200 |

**List filters:** `?estado=`, `?severidad=`, `?dia_id=`  
**Editable fields in PATCH:** `asistente_id`, `zona_id`, `severidad`, `descripcion`. Sending any other field → 400.

### Create — `POST /api/incidentes`

```json
{
  "zona_id": 7,
  "dia_id": 3,
  "severidad": "LEVE",
  "descripcion": "Golpe de calor en la fila del baño"
}
```

### Example — `GET /api/incidentes/2`

```json
{
  "data": {
    "id": 2,
    "asistente_id": null,
    "zona_id": 8,
    "dia_id": 1,
    "severidad": "MODERADA",
    "descripcion": "Caída en la fila de ingreso",
    "estado": "EN_ATENCION",
    "state": "ACTIVE"
  }
}
```

### `PATCH /api/incidentes/:id/estado`

Body: `{ "estado": "EN_ATENCION" }`. Invalid state → 400.

### `GET /api/incidentes/resumen?dia_id=1`

Count of active incidents by state. `dia_id` is optional; if supplied and not numeric → 400.

```json
{
  "data": {
    "dia_id": 1,
    "ABIERTO": 1,
    "EN_ATENCION": 1,
    "CERRADO": 0
  }
}
```

## Validations → 400 / 404

- `zona_id` and `dia_id` are required integers; `asistente_id` is optional (it may be unidentified). If any are missing → 404.
- `severidad` is `LEVE`, `MODERADA`, or `GRAVE`; `descripcion` must be between 10 and 500 characters.
- Incidents are created in state `ABIERTO`. The `estado` **is not changed** by the general `PATCH` method (→ 400); it is changed via the dedicated status endpoint.

## Business rules → 409

1. State advances in order: `ABIERTO → EN_ATENCION → CERRADO`. Skipping a step or going backward → 409.
2. A `CERRADO` incident cannot be edited (PATCH → 409).
3. Only `ABIERTO` incidents can be deleted; others → 409.

## Tips

- The rules live in the **use case** (`application/`), not in the controller. The use case queries the repository before deciding.
- Check the preloaded data table to see which records the tests use (section *Preloaded data* in CONVENTIONS.md) and **do not modify them manually**.
- Run the public tests continuously. Each red test tells you which request failed and what your API responded.
