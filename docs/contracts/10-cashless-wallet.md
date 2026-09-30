# Module 10 — Cashless wallet

**Difficulty:** ★★☆ Intermediate  
**Tests:** `node tests/run.mjs billetera http://localhost:3000`

> The festival bracelet works like a wallet: it is recharged and consumed.

Read [CONVENTIONS.md](CONVENTIONS.md) first: the response format, pagination, and error codes apply to all modules.

## Tables

**Your team writes in** (and only in these):

### `movimientos`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `asistente_id` | int | yes |
| `tipo` | varchar(8) | yes |
| `monto` | int | yes |
| `descripcion` | varchar(200) | no |
| `state` | varchar(20) | yes *(automatic)* |

**Read-only** (preloaded data or other modules): `asistentes`

## Endpoints

| Method | Route | Success |
|---|---|---|
| GET | `/api/movimientos` | 200 paginated |
| GET | `/api/movimientos/:id` | 200 |
| POST | `/api/movimientos` | 201 |
| PATCH | `/api/movimientos/:id` | 200 |
| DELETE | `/api/movimientos/:id` | 200 (logical delete) |
| GET | `/api/billeteras/:asistenteId/saldo` | 200 |

**List filters:** `?asistente_id=`, `?tipo=`  
**Editable fields in PATCH:** `descripcion`. Sending any other field → 400.

### Create — `POST /api/movimientos`

```json
{
  "asistente_id": 2,
  "tipo": "RECARGA",
  "monto": 50000,
  "descripcion": "Recarga en taquilla"
}
```

### Example — `GET /api/movimientos/1`

```json
{
  "data": {
    "id": 1,
    "asistente_id": 1,
    "tipo": "RECARGA",
    "monto": 200000,
    "descripcion": "Recarga en taquilla",
    "state": "ACTIVE"
  }
}
```

### `GET /api/billeteras/:asistenteId/saldo`

Current balance for the attendee. Missing → 404.

```json
{
  "data": {
    "asistente_id": 1,
    "saldo": 150000
  }
}
```

## Validations → 400 / 404

- `asistente_id` is a required integer; if it does not exist → 404.
- `tipo` is `RECARGA` or `CONSUMO`; `monto` is a positive integer.
- A `RECARGA` ranges from 10000 to 2000000.
- `descripcion` is optional (maximum 200). It is **the only editable field**: a `PATCH` with `monto` or `tipo` → 400.

## Business rules → 409

1. The **balance** is the sum of recharges minus the sum of active consumptions.
2. A `CONSUMO` cannot leave the balance negative.
3. Canceling (DELETE) a `RECARGA` cannot leave the balance negative.

## Tips

- The rules live in the **use case** (`application/`), not in the controller. The use case queries the repository before deciding.
- Check the preloaded data table to see which records the tests use (section *Preloaded data* in CONVENTIONS.md) and **do not modify them manually**.
- Run the public tests continuously. Each red test tells you which request failed and what your API responded.
