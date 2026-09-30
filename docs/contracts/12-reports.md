# Module 12 — Reports

**Difficulty:** ★★★ Advanced — recommended for teams of 4  
**Tests:** `node tests/run.mjs reportes http://localhost:3000`

> The organization dashboard: queries that cross-reference information throughout the festival.

Read [CONVENTIONS.md](CONVENTIONS.md) first: the response format, pagination, and error codes apply to all modules.

## Tables

**Read-only** (preloaded data or other modules): `dias`, `boletas`, `artistas`, `shows`, `resenas`, `escenarios`, `pedidos_comida`, `productos_comida`

## Endpoints

| Method | Route | Success |
|---|---|---|
| GET | `/api/reportes/ventas-por-dia` | 200 |
| GET | `/api/reportes/top-artistas?limit=3` | 200 |
| GET | `/api/reportes/ocupacion/:diaId` | 200 |
| GET | `/api/reportes/escenarios/:escenarioId/agenda?dia_id=1` | 200 |
| GET | `/api/reportes/comida/top-productos` | 200 |

### `GET /api/reportes/ventas-por-dia`

All days (including those without sales), ordered by date, with ticket count and revenue.

```json
{
  "data": [
    {
      "dia_id": 4,
      "nombre": "Pre-party",
      "fecha": "2026-11-19",
      "boletas": 3,
      "ingresos": 750000
    },
    {
      "dia_id": 1,
      "nombre": "Viernes",
      "fecha": "2026-11-20",
      "boletas": 8,
      "ingresos": 3110000
    }
  ]
}
```

### `GET /api/reportes/top-artistas?limit=3`

Artists with at least one review, ordered by average score (desc), then by number of reviews (desc), then by name. `limit` must be between 1 and 10, default 5; outside this range → 400.

```json
{
  "data": [
    {
      "artista_id": 10,
      "nombre": "Mon Laferte",
      "promedio": 5,
      "resenas": 1
    },
    {
      "artista_id": 1,
      "nombre": "Bomba Estéreo",
      "promedio": 4.67,
      "resenas": 3
    }
  ]
}
```

### `GET /api/reportes/ocupacion/:diaId`

Capacity, tickets sold, and occupancy percentage. Invalid id → 400; missing → 404.

```json
{
  "data": {
    "dia_id": 4,
    "aforo": 3,
    "vendidas": 3,
    "porcentaje": 100
  }
}
```

### `GET /api/reportes/escenarios/:escenarioId/agenda?dia_id=1`

Shows for the stage on that day with the artist name, ordered by `hora_inicio`. `dia_id` is required → if missing, 400. Stage not found → 404.

```json
{
  "data": [
    {
      "show_id": 10,
      "artista": "Aterciopelados",
      "hora_inicio": "17:00",
      "hora_fin": "18:30"
    },
    {
      "show_id": 8,
      "artista": "Mon Laferte",
      "hora_inicio": "20:00",
      "hora_fin": "21:30"
    }
  ]
}
```

### `GET /api/reportes/comida/top-productos`

Food products with at least one order, ordered by units sold (desc).

```json
{
  "data": [
    {
      "producto_id": 1,
      "nombre": "Arepa de choclo con queso",
      "unidades": 2,
      "ingresos": 24000
    },
    {
      "producto_id": 3,
      "nombre": "Salchipapa especial",
      "unidades": 1,
      "ingresos": 18000
    }
  ]
}
```

## Validations → 400 / 404

- All endpoints are **read-only** (`GET`). There is no CRUD.
- Only records with `state = 'ACTIVE'` are counted.
- Averages and percentages are rounded to **2 decimals** and returned as numbers.

## Tips

- Check the preloaded data table to see which records the tests use (section *Preloaded data* in CONVENTIONS.md) and **do not modify them manually**.
- Run the public tests continuously. Each red test tells you which request failed and what your API responded.
