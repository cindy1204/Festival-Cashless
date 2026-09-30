# Module 07 — Merch store

**Difficulty:** ★★★ Advanced — recommended for teams of 4  
**Tests:** `node tests/run.mjs merch http://localhost:3000`

> Sell official artist merchandise with inventory and per-buyer limits.

Read [CONVENTIONS.md](CONVENTIONS.md) first: the response format, pagination, and error codes apply to all modules.

## Tables

**Your team writes in** (and only in these):

### `ventas_merch`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `asistente_id` | int | yes |
| `producto_id` | int | yes |
| `cantidad` | int | yes |
| `total` | int | yes |
| `state` | varchar(20) | yes *(automatic)* |

### `productos_merch`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `nombre` | varchar(100) | yes |
| `artista_id` | int | no |
| `precio` | int | yes |
| `stock` | int | yes |
| `state` | varchar(20) | yes *(automatic)* |

**Read-only** (preloaded data or other modules): `asistentes`, `artistas`

## Endpoints

| Method | Route | Success |
|---|---|---|
| GET | `/api/ventas-merch` | 200 paginated |
| GET | `/api/ventas-merch/:id` | 200 |
| POST | `/api/ventas-merch` | 201 |
| PATCH | `/api/ventas-merch/:id` | 200 |
| DELETE | `/api/ventas-merch/:id` | 200 (logical delete) |
| GET | `/api/productos-merch` | 200 |
| GET | `/api/productos-merch/:id` | 200 |

**List filters:** `?asistente_id=`, `?producto_id=`  
**Editable fields in PATCH:** `cantidad`. Sending any other field → 400.

### Create — `POST /api/ventas-merch`

```json
{
  "asistente_id": 6,
  "producto_id": 2,
  "cantidad": 2
}
```

### Example — `GET /api/ventas-merch/1`

```json
{
  "data": {
    "id": 1,
    "asistente_id": 5,
    "producto_id": 1,
    "cantidad": 4,
    "total": 340000,
    "state": "ACTIVE"
  }
}
```

### `GET /api/productos-merch`

Paginated list. Filter: `?artista_id=`.

```json
{
  "pagination": {
    "total": 5,
    "currentPage": 1,
    "limit": 2,
    "totalPages": 3
  },
  "data": [
    {
      "id": 1,
      "nombre": "Camiseta Bomba Estéreo",
      "artista_id": 1,
      "precio": 85000,
      "stock": 40,
      "state": "ACTIVE"
    },
    {
      "id": 2,
      "nombre": "Gorra Morat",
      "artista_id": 4,
      "precio": 60000,
      "stock": 25,
      "state": "ACTIVE"
    }
  ]
}
```

### `GET /api/productos-merch/:id`

A product with its stock. Missing → 404.

```json
{
  "data": {
    "id": 2,
    "nombre": "Gorra Morat",
    "artista_id": 4,
    "precio": 60000,
    "stock": 25,
    "state": "ACTIVE"
  }
}
```

## Validations → 400 / 404

- `asistente_id` and `producto_id` are required integers; if they do not exist → 404.
- `cantidad` is an integer between 1 and 5.
- The **server calculates the total**: `precio × cantidad`.

## Business rules → 409

1. No more is sold than the `stock`. Selling **reduces** stock; canceling (DELETE) **restores** it.
2. An attendee buys **at most 5 units** of the same product when summing all active sales.
3. A `PATCH` on `cantidad` recalculates the total and adjusts the stock by the difference while respecting both rules.

## Tips

- The rules live in the **use case** (`application/`), not in the controller. The use case queries the repository before deciding.
- Check the preloaded data table to see which records the tests use (section *Preloaded data* in CONVENTIONS.md) and **do not modify them manually**.
- Run the public tests continuously. Each red test tells you which request failed and what your API responded.
