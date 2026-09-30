# Module 03 — Food

**Difficulty:** ★★★ Advanced — recommended for teams of 4  
**Tests:** `node tests/run.mjs comida http://localhost:3000`

> Receive food court and food truck orders while tracking inventory for each product.

Read [CONVENTIONS.md](CONVENTIONS.md) first: the response format, pagination, and error codes apply to all modules.

## Tables

**Your team writes in** (and only in these):

### `pedidos_comida`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `asistente_id` | int | yes |
| `producto_id` | int | yes |
| `cantidad` | int | yes |
| `total` | int | yes |
| `estado` | varchar(12) | yes |
| `state` | varchar(20) | yes *(automatic)* |

### `productos_comida`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `nombre` | varchar(100) | yes |
| `zona_id` | int | yes |
| `precio` | int | yes |
| `stock` | int | yes |
| `state` | varchar(20) | yes *(automatic)* |

**Read-only** (preloaded data or other modules): `asistentes`, `zonas`

## Endpoints

| Method | Route | Success |
|---|---|---|
| GET | `/api/pedidos-comida` | 200 paginated |
| GET | `/api/pedidos-comida/:id` | 200 |
| POST | `/api/pedidos-comida` | 201 |
| PATCH | `/api/pedidos-comida/:id` | 200 |
| DELETE | `/api/pedidos-comida/:id` | 200 (logical delete) |
| GET | `/api/productos-comida` | 200 |
| GET | `/api/productos-comida/:id` | 200 |

**List filters:** `?asistente_id=`, `?producto_id=`, `?estado=`  
**Editable fields in PATCH:** `estado`. Sending any other field → 400.

### Create — `POST /api/pedidos-comida`

```json
{
  "asistente_id": 5,
  "producto_id": 2,
  "cantidad": 2
}
```

### Example — `GET /api/pedidos-comida/1`

```json
{
  "data": {
    "id": 1,
    "asistente_id": 1,
    "producto_id": 1,
    "cantidad": 2,
    "total": 24000,
    "estado": "ENTREGADO",
    "state": "ACTIVE"
  }
}
```

### `GET /api/productos-comida`

Paginated list of products. Filter: `?zona_id=`.

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
      "nombre": "Arepa de choclo con queso",
      "zona_id": 5,
      "precio": 12000,
      "stock": 100,
      "state": "ACTIVE"
    },
    {
      "id": 2,
      "nombre": "Bandeja paisa mini",
      "zona_id": 5,
      "precio": 28000,
      "stock": 50,
      "state": "ACTIVE"
    }
  ]
}
```

### `GET /api/productos-comida/:id`

A product with its current stock. Missing → 404.

```json
{
  "data": {
    "id": 2,
    "nombre": "Bandeja paisa mini",
    "zona_id": 5,
    "precio": 28000,
    "stock": 50,
    "state": "ACTIVE"
  }
}
```

## Validations → 400 / 404

- `asistente_id` and `producto_id` are required integers; if they do not exist → 404.
- `cantidad` is an integer between 1 and 10.
- The **server calculates the total**: `product price × quantity`. The order is created in state `PENDIENTE`.
- `PATCH` only changes `estado` to `PENDIENTE` or `ENTREGADO`; any other value → 400.

## Business rules → 409

1. You cannot request more quantity than the product's `stock`.
2. Creating the order **decreases** stock; canceling it (DELETE) **returns** it.
3. An `ENTREGADO` order **cannot be canceled**.

## Tips

- The rules live in the **use case** (`application/`), not in the controller. The use case queries the repository before deciding.
- Check the preloaded data table to see which records the tests use (section *Preloaded data* in CONVENTIONS.md) and **do not modify them manually**.
- Run the public tests continuously. Each red test tells you which request failed and what your API responded.
