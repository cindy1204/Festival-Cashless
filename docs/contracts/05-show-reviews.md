# Module 05 — Show reviews

**Difficulty:** ★★☆ Intermediate  
**Tests:** `node tests/run.mjs resenas http://localhost:3000`

> Let attendees rate the shows they attended.

Read [CONVENTIONS.md](CONVENTIONS.md) first: the response format, pagination, and error codes apply to all modules.

## Tables

**Your team writes in** (and only in these):

### `resenas`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `asistente_id` | int | yes |
| `show_id` | int | yes |
| `puntaje` | int | yes |
| `comentario` | varchar(500) | no |
| `state` | varchar(20) | yes *(automatic)* |

**Read-only** (preloaded data or other modules): `asistentes`, `shows`, `boletas`

## Endpoints

| Method | Route | Success |
|---|---|---|
| GET | `/api/resenas` | 200 paginated |
| GET | `/api/resenas/:id` | 200 |
| POST | `/api/resenas` | 201 |
| PATCH | `/api/resenas/:id` | 200 |
| DELETE | `/api/resenas/:id` | 200 (logical delete) |
| GET | `/api/resenas/show/:showId/promedio` | 200 |

**List filters:** `?show_id=`, `?asistente_id=`  
**Editable fields in PATCH:** `puntaje`, `comentario`. Sending any other field → 400.

### Create — `POST /api/resenas`

```json
{
  "asistente_id": 5,
  "show_id": 1,
  "puntaje": 4,
  "comentario": "Buen cierre de viernes"
}
```

### Example — `GET /api/resenas/1`

```json
{
  "data": {
    "id": 1,
    "asistente_id": 1,
    "show_id": 1,
    "puntaje": 5,
    "comentario": "El cierre con Fuego fue increíble",
    "state": "ACTIVE"
  }
}
```

### `GET /api/resenas/show/:showId/promedio`

Average (rounded to 2 decimals) and total of active reviews. Without reviews → `promedio: 0`. Show not found → 404.

```json
{
  "data": {
    "show_id": 1,
    "total": 3,
    "promedio": 4.67
  }
}
```

## Validations → 400 / 404

- `asistente_id` and `show_id` are required integers; if they do not exist → 404.
- `puntaje` is an **integer** from 1 to 5 (3.5 is not valid).
- `comentario` is optional, maximum 500 characters.

## Business rules → 409

1. Only someone with an **active ticket for the show day** can review it (matching `shows.dia_id` with `boletas.dia_id`).
2. Only one active review per attendee and show. If deleted, they can review again.

## Tips

- The rules live in the **use case** (`application/`), not in the controller. The use case queries the repository before deciding.
- Check the preloaded data table to see which records the tests use (section *Preloaded data* in CONVENTIONS.md) and **do not modify them manually**.
- Run the public tests continuously. Each red test tells you which request failed and what your API responded.
