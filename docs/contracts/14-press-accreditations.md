# Module 14 — Press accreditations

**Difficulty:** ★★☆ Intermediate  
**Tests:** `node tests/run.mjs acreditaciones http://localhost:3000`

> Manage applications from journalists, photographers, and influencers covering the festival.

Read [CONVENTIONS.md](CONVENTIONS.md) first: the response format, pagination, and error codes apply to all modules.

## Tables

**Your team writes in** (and only in these):

### `acreditaciones`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `nombre` | varchar(100) | yes |
| `medio` | varchar(100) | yes |
| `email` | varchar(120) | yes |
| `tipo` | varchar(12) | yes |
| `dia_id` | int | yes |
| `escenario_id` | int | no |
| `estado` | varchar(10) | yes |
| `motivo_rechazo` | varchar(300) | no |
| `state` | varchar(20) | yes *(automatic)* |

**Read-only** (preloaded data or other modules): `dias`, `escenarios`

## Endpoints

| Method | Route | Success |
|---|---|---|
| GET | `/api/acreditaciones` | 200 paginated |
| GET | `/api/acreditaciones/:id` | 200 |
| POST | `/api/acreditaciones` | 201 |
| PATCH | `/api/acreditaciones/:id` | 200 |
| DELETE | `/api/acreditaciones/:id` | 200 (logical delete) |
| PATCH | `/api/acreditaciones/:id/estado` | 200 |

**List filters:** `?tipo=`, `?estado=`, `?dia_id=`  
**Editable fields in PATCH:** `nombre`, `medio`. Sending any other field → 400.

### Create — `POST /api/acreditaciones`

```json
{
  "nombre": "Pedro Mora",
  "medio": "Semana",
  "email": "pedro.mora@semana.com",
  "tipo": "PRENSA",
  "dia_id": 2
}
```

### Example — `GET /api/acreditaciones/1`

```json
{
  "data": {
    "id": 1,
    "nombre": "Laura Gómez",
    "medio": "El Espectador",
    "email": "laura.gomez@elespectador.com",
    "tipo": "PRENSA",
    "dia_id": 1,
    "escenario_id": null,
    "estado": "APROBADA",
    "motivo_rechazo": null,
    "state": "ACTIVE"
  }
}
```

### `PATCH /api/acreditaciones/:id/estado`

Body: `{ "estado": "APROBADA" }` or `{ "estado": "RECHAZADA", "motivo": "..." }`. The reason is saved in `motivo_rechazo`. Invalid state → 400.

## Validations → 400 / 404

- `nombre`, `medio`, `email`, `tipo`, and `dia_id` are required; `email` must match a valid format.
- `tipo` is `PRENSA`, `FOTOGRAFO`, or `INFLUENCER`. A `FOTOGRAFO` **must** include `escenario_id` → otherwise 400.
- If the day or the stage does not exist → 404.
- The request is created as `PENDIENTE`.

## Business rules → 409

1. The same email can have at most one active accreditation per day (another day is allowed).
2. Maximum **5 photographers** per stage and day; rejected applications do not count.
3. Only a request in `PENDIENTE` can be decided (approved or rejected) → otherwise 409. Rejection requires a `motivo` → if missing, 400.

## Tips

- The rules live in the **use case** (`application/`), not in the controller. The use case queries the repository before deciding.
- Check the preloaded data table to see which records the tests use (section *Preloaded data* in CONVENTIONS.md) and **do not modify them manually**.
- Run the public tests continuously. Each red test tells you which request failed and what your API responded.
