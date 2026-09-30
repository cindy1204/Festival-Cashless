# Module 09 — Transport

**Difficulty:** ★☆☆ Basic — recommended if you work alone  
**Tests:** `node tests/run.mjs transporte http://localhost:3000`

> Reserve seats on the official buses to and from the festival.

Read [CONVENTIONS.md](CONVENTIONS.md) first: the response format, pagination, and error codes apply to all modules.

## Tables

**Your team writes in** (and only in these):

### `reservas_bus`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `asistente_id` | int | yes |
| `bus_id` | int | yes |
| `state` | varchar(20) | yes *(automatic)* |

### `buses`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `ruta` | varchar(100) | yes |
| `dia_id` | int | yes |
| `hora_salida` | varchar(5) | yes |
| `capacidad` | int | yes |
| `estado` | varchar(12) | yes |
| `state` | varchar(20) | yes *(automatic)* |

**Read-only** (preloaded data or other modules): `asistentes`, `dias`

## Endpoints

| Method | Route | Success |
|---|---|---|
| GET | `/api/reservas-bus` | 200 paginated |
| GET | `/api/reservas-bus/:id` | 200 |
| POST | `/api/reservas-bus` | 201 |
| PATCH | `/api/reservas-bus/:id` | 200 |
| DELETE | `/api/reservas-bus/:id` | 200 (logical delete) |
| GET | `/api/buses` | 200 |
| GET | `/api/buses/:id` | 200 |
| PATCH | `/api/buses/:id/estado` | 200 |

**List filters:** `?bus_id=`, `?asistente_id=`  
**Editable fields in PATCH:** `bus_id`. Sending any other field → 400.

### Create — `POST /api/reservas-bus`

```json
{
  "asistente_id": 5,
  "bus_id": 1
}
```

### Example — `GET /api/reservas-bus/1`

```json
{
  "data": {
    "id": 1,
    "asistente_id": 1,
    "bus_id": 2,
    "state": "ACTIVE"
  }
}
```

### `GET /api/buses`

Paginated list. Filters: `?dia_id=` and `?estado=`.

```json
{
  "pagination": {
    "total": 6,
    "currentPage": 1,
    "limit": 2,
    "totalPages": 3
  },
  "data": [
    {
      "id": 1,
      "ruta": "Centro → Festival",
      "dia_id": 1,
      "hora_salida": "15:00",
      "capacidad": 40,
      "estado": "PROGRAMADO",
      "state": "ACTIVE"
    },
    {
      "id": 2,
      "ruta": "Portal Norte → Festival",
      "dia_id": 1,
      "hora_salida": "16:00",
      "capacidad": 2,
      "estado": "PROGRAMADO",
      "state": "ACTIVE"
    }
  ]
}
```

### `GET /api/buses/:id`

A bus. Missing → 404.

```json
{
  "data": {
    "id": 2,
    "ruta": "Portal Norte → Festival",
    "dia_id": 1,
    "hora_salida": "16:00",
    "capacidad": 2,
    "estado": "PROGRAMADO",
    "state": "ACTIVE"
  }
}
```

### `PATCH /api/buses/:id/estado`

Changes the bus state. Body: `{ "estado": "SALIO" }`.

## Validations → 400 / 404

- `asistente_id` and `bus_id` are required integers; if they do not exist → 404.

## Business rules → 409

1. Only a bus in `PROGRAMADO` state can be reserved (not `SALIO` or `CANCELADO`).
2. A bus cannot receive more reservations than its `capacidad`.
3. An attendee has at most one active reservation per bus.
4. Bus states: `PROGRAMADO → SALIO` or `PROGRAMADO → CANCELADO`. Any other change (including going back to `PROGRAMADO`) → 409. An invalid state → 400.

## Tips

- The rules live in the **use case** (`application/`), not in the controller. The use case queries the repository before deciding.
- Check the preloaded data table to see which records the tests use (section *Preloaded data* in CONVENTIONS.md) and **do not modify them manually**.
- Run the public tests continuously. Each red test tells you which request failed and what your API responded.
