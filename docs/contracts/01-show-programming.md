# Module 01 — Show programming

**Difficulty:** ★★☆ Intermediate  
**Tests:** `node tests/run.mjs programacion http://localhost:3000`

> Build the festival lineup: which artist plays, on which stage, on which day, and at what time.

Read [CONVENTIONS.md](CONVENTIONS.md) first: the response format, pagination, and error codes apply to all modules.

## Tables

**Your team writes in** (and only in these):

### `shows`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `artista_id` | int | yes |
| `escenario_id` | int | yes |
| `dia_id` | int | yes |
| `hora_inicio` | varchar(5) | yes |
| `hora_fin` | varchar(5) | yes |
| `state` | varchar(20) | yes *(automatic)* |

**Read-only** (preloaded data or other modules): `artistas`, `escenarios`, `dias`

## Endpoints

| Method | Route | Success |
|---|---|---|
| GET | `/api/shows` | 200 paginated |
| GET | `/api/shows/:id` | 200 |
| POST | `/api/shows` | 201 |
| PATCH | `/api/shows/:id` | 200 |
| DELETE | `/api/shows/:id` | 200 (logical delete) |
| GET | `/api/shows/artista/:artistaId` | 200 |

**List filters:** `?dia_id=`, `?escenario_id=`, `?artista_id=`  
**Editable fields in PATCH:** `artista_id`, `escenario_id`, `dia_id`, `hora_inicio`, `hora_fin`. Sending any other field → 400.

### Create — `POST /api/shows`

```json
{
  "artista_id": 11,
  "escenario_id": 4,
  "dia_id": 2,
  "hora_inicio": "14:00",
  "hora_fin": "15:00"
}
```

### Example — `GET /api/shows/1`

```json
{
  "data": {
    "id": 1,
    "artista_id": 1,
    "escenario_id": 1,
    "dia_id": 1,
    "hora_inicio": "21:00",
    "hora_fin": "22:30",
    "state": "ACTIVE"
  }
}
```

### `GET /api/shows/artista/:artistaId`

Active shows for the artist, ordered by day and time. No pagination: `{ "data": [ ... ] }`. Artist not found → 404.

```json
{
  "data": [
    {
      "id": 1,
      "artista_id": 1,
      "escenario_id": 1,
      "dia_id": 1,
      "hora_inicio": "21:00",
      "hora_fin": "22:30",
      "state": "ACTIVE"
    }
  ]
}
```

## Validations → 400 / 404

- `artista_id`, `escenario_id`, and `dia_id` are required integers.
- `hora_inicio` and `hora_fin` must use `HH:MM` 24-hour format with leading zero (`09:00`, not `9:00`; `25:00` is invalid).
- `hora_fin` must be later than `hora_inicio`.
- If the artist, stage, or day does not exist → **404**.

## Business rules → 409

1. A stage cannot have two **overlapping** shows on the same day. A show that starts exactly when another ends is **not** overlapping (`21:00–22:30` and `22:30–23:00` coexist).
2. An artist **cannot play twice** on the same day.
3. The same rules also apply when editing with `PATCH` (without comparing against itself).

## Tips

- The rules live in the **use case** (`application/`), not in the controller. The use case queries the repository before deciding.
- Check the preloaded data table to see which records the tests use (section *Preloaded data* in CONVENTIONS.md) and **do not modify them manually**.
- Run the public tests continuously. Each red test tells you which request failed and what your API responded.
