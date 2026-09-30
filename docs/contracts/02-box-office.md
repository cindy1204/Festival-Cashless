# Module 02 — Box office

**Difficulty:** ★★☆ Intermediate  
**Tests:** `node tests/run.mjs boleteria http://localhost:3000`

> Sell tickets for each festival day without exceeding capacity.

Read [CONVENTIONS.md](CONVENTIONS.md) first: the response format, pagination, and error codes apply to all modules.

## Tables

**Your team writes in** (and only in these):

### `boletas`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `asistente_id` | int | yes |
| `dia_id` | int | yes |
| `tipo` | varchar(10) | yes |
| `precio` | int | yes |
| `state` | varchar(20) | yes *(automatic)* |

**Read-only** (preloaded data or other modules): `asistentes`, `dias`

## Endpoints

| Method | Route | Success |
|---|---|---|
| GET | `/api/boletas` | 200 paginated |
| GET | `/api/boletas/:id` | 200 |
| POST | `/api/boletas` | 201 |
| PATCH | `/api/boletas/:id` | 200 |
| DELETE | `/api/boletas/:id` | 200 (logical delete) |
| GET | `/api/boletas/dia/:diaId/disponibilidad` | 200 |

**List filters:** `?dia_id=`, `?asistente_id=`, `?tipo=`  
**Editable fields in PATCH:** `tipo`. Sending any other field → 400.

### Create — `POST /api/boletas`

```json
{
  "asistente_id": 14,
  "dia_id": 1,
  "tipo": "GENERAL"
}
```

### Example — `GET /api/boletas/1`

```json
{
  "data": {
    "id": 1,
    "asistente_id": 1,
    "dia_id": 4,
    "tipo": "GENERAL",
    "precio": 250000,
    "state": "ACTIVE"
  }
}
```

### `GET /api/boletas/dia/:diaId/disponibilidad`

Capacity, sold, and available for the day. Day not found → 404.

```json
{
  "data": {
    "dia_id": 4,
    "aforo": 3,
    "vendidas": 3,
    "disponibles": 0
  }
}
```

## Validations → 400 / 404

- `asistente_id` and `dia_id` are required integers; if they do not exist → 404.
- `tipo` is `GENERAL`, `VIP`, or `PLATINO`.
- The **server calculates the price** based on the type: GENERAL 250000, VIP 480000, PLATINO 900000. If the client sends a `precio`, it is ignored.
- When changing the `tipo` with `PATCH`, the price is recalculated.

## Business rules → 409

1. No more tickets are sold than the day’s `aforo` (only active tickets are counted).
2. An attendee has **at most one active ticket per day**. If they cancel it (DELETE), they can buy again.

## Tips

- The rules live in the **use case** (`application/`), not in the controller. The use case queries the repository before deciding.
- Check the preloaded data table to see which records the tests use (section *Preloaded data* in CONVENTIONS.md) and **do not modify them manually**.
- Run the public tests continuously. Each red test tells you which request failed and what your API responded.
