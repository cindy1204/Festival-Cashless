# Module 04 — Volunteer shifts

**Difficulty:** ★★★ Advanced — recommended for teams of 4  
**Tests:** `node tests/run.mjs voluntarios http://localhost:3000`

> Organize volunteer shifts while making sure no one works too much.

Read [CONVENTIONS.md](CONVENTIONS.md) first: the response format, pagination, and error codes apply to all modules.

## Tables

**Your team writes in** (and only in these):

### `turnos`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `voluntario_id` | int | yes |
| `zona_id` | int | yes |
| `dia_id` | int | yes |
| `hora_inicio` | varchar(5) | yes |
| `hora_fin` | varchar(5) | yes |
| `rol` | varchar(20) | yes |
| `state` | varchar(20) | yes *(automatic)* |

**Read-only** (preloaded data or other modules): `voluntarios`, `zonas`, `dias`

## Endpoints

| Method | Route | Success |
|---|---|---|
| GET | `/api/turnos` | 200 paginated |
| GET | `/api/turnos/:id` | 200 |
| POST | `/api/turnos` | 201 |
| PATCH | `/api/turnos/:id` | 200 |
| DELETE | `/api/turnos/:id` | 200 (logical delete) |
| GET | `/api/turnos/voluntario/:voluntarioId/horas?dia_id=1` | 200 |

**List filters:** `?voluntario_id=`, `?dia_id=`, `?zona_id=`  
**Editable fields in PATCH:** `zona_id`, `dia_id`, `hora_inicio`, `hora_fin`, `rol`. Sending any other field → 400.

### Create — `POST /api/turnos`

```json
{
  "voluntario_id": 1,
  "zona_id": 7,
  "dia_id": 1,
  "hora_inicio": "19:00",
  "hora_fin": "20:00",
  "rol": "LOGISTICA"
}
```

### Example — `GET /api/turnos/1`

```json
{
  "data": {
    "id": 1,
    "voluntario_id": 1,
    "zona_id": 8,
    "dia_id": 1,
    "hora_inicio": "10:00",
    "hora_fin": "14:00",
    "rol": "LOGISTICA",
    "state": "ACTIVE"
  }
}
```

### `GET /api/turnos/voluntario/:voluntarioId/horas?dia_id=1`

Hours worked that day (supports decimals: 1.5). `dia_id` is required → if missing, 400. Volunteer not found → 404.

```json
{
  "data": {
    "voluntario_id": 1,
    "dia_id": 1,
    "horas": 7
  }
}
```

## Validations → 400 / 404

- `voluntario_id`, `zona_id`, and `dia_id` are required integers; if they do not exist → 404.
- `hora_inicio` and `hora_fin` use `HH:MM` format (24-hour, with leading zero); `hora_fin` must be later than `hora_inicio`.
- `rol` is `LOGISTICA`, `PUNTO_INFO`, `ASEO`, or `PRIMEROS_AUXILIOS`.

## Business rules → 409

1. A volunteer **cannot have overlapping shifts** on the same day. Contiguous shifts (`12:00–16:00` and `16:00–18:00`) are allowed.
2. A volunteer works **maximum 8 hours** per day, summing all active shifts. Exactly 8 is allowed.
3. The same rules apply when editing with `PATCH`.

## Tips

- The rules live in the **use case** (`application/`), not in the controller. The use case queries the repository before deciding.
- Check the preloaded data table to see which records the tests use (section *Preloaded data* in CONVENTIONS.md) and **do not modify them manually**.
- Run the public tests continuously. Each red test tells you which request failed and what your API responded.
