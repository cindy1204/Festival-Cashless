# Module 06 — Parking

**Difficulty:** ★★☆ Intermediate  
**Tests:** `node tests/run.mjs parqueadero http://localhost:3000`

> Reserve parking spots for cars and motorcycles by day.

Read [CONVENTIONS.md](CONVENTIONS.md) first: the response format, pagination, and error codes apply to all modules.

## Tables

**Your team writes in** (and only in these):

### `reservas_parqueadero`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `asistente_id` | int | yes |
| `zona_id` | int | yes |
| `dia_id` | int | yes |
| `placa` | varchar(6) | yes |
| `tipo_vehiculo` | varchar(5) | yes |
| `state` | varchar(20) | yes *(automatic)* |

**Read-only** (preloaded data or other modules): `asistentes`, `zonas`, `dias`

## Endpoints

| Method | Route | Success |
|---|---|---|
| GET | `/api/reservas-parqueadero` | 200 paginated |
| GET | `/api/reservas-parqueadero/:id` | 200 |
| POST | `/api/reservas-parqueadero` | 201 |
| PATCH | `/api/reservas-parqueadero/:id` | 200 |
| DELETE | `/api/reservas-parqueadero/:id` | 200 (logical delete) |
| GET | `/api/reservas-parqueadero/placa/:placa` | 200 |

**List filters:** `?dia_id=`, `?zona_id=`, `?asistente_id=`  
**Editable fields in PATCH:** `zona_id`, `dia_id`, `placa`, `tipo_vehiculo`. Sending any other field → 400.

### Create — `POST /api/reservas-parqueadero`

```json
{
  "asistente_id": 5,
  "zona_id": 3,
  "dia_id": 1,
  "placa": "XYZ123",
  "tipo_vehiculo": "CARRO"
}
```

### Example — `GET /api/reservas-parqueadero/2`

```json
{
  "data": {
    "id": 2,
    "asistente_id": 2,
    "zona_id": 3,
    "dia_id": 1,
    "placa": "KJH345",
    "tipo_vehiculo": "CARRO",
    "state": "ACTIVE"
  }
}
```

### `GET /api/reservas-parqueadero/placa/:placa`

Active reservations for that plate. No pagination. If none exist, `{ "data": [] }`.

```json
{
  "data": [
    {
      "id": 2,
      "asistente_id": 2,
      "zona_id": 3,
      "dia_id": 1,
      "placa": "KJH345",
      "tipo_vehiculo": "CARRO",
      "state": "ACTIVE"
    }
  ]
}
```

## Validations → 400 / 404

- `asistente_id`, `zona_id`, and `dia_id` are required integers; if they do not exist → 404.
- `tipo_vehiculo` is `CARRO` or `MOTO`.
- `placa` for CARRO: 3 uppercase letters + 3 digits (`XYZ123`). For MOTO: 3 letters + 2 digits + 1 letter (`ABC12D`). If it does not match its type → 400.
- The zone must be of type `PARQUEADERO`; otherwise → 400.

## Business rules → 409

1. A zone cannot receive more reservations than its `capacidad` on the same day.
2. A plate has **at most one active reservation per day** (it may be different on another day).

## Tips

- The rules live in the **use case** (`application/`), not in the controller. The use case queries the repository before deciding.
- Check the preloaded data table to see which records the tests use (section *Preloaded data* in CONVENTIONS.md) and **do not modify them manually**.
- Run the public tests continuously. Each red test tells you which request failed and what your API responded.
