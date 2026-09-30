# Module 15 — Meet & Greet

**Difficulty:** ★☆☆ Basic — recommended if you work alone  
**Tests:** `node tests/run.mjs meet-greet http://localhost:3000`

> Register VIP attendees to meet artists after their show.

Read [CONVENTIONS.md](CONVENTIONS.md) first: the response format, pagination, and error codes apply to all modules.

## Tables

**Your team writes in** (and only in these):

### `inscripciones_meet`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `asistente_id` | int | yes |
| `show_id` | int | yes |
| `state` | varchar(20) | yes *(automatic)* |

**Read-only** (preloaded data or other modules): `asistentes`, `shows`, `boletas`

## Endpoints

| Method | Route | Success |
|---|---|---|
| GET | `/api/inscripciones-meet` | 200 paginated |
| GET | `/api/inscripciones-meet/:id` | 200 |
| POST | `/api/inscripciones-meet` | 201 |
| PATCH | `/api/inscripciones-meet/:id` | 200 |
| DELETE | `/api/inscripciones-meet/:id` | 200 (logical delete) |
| GET | `/api/inscripciones-meet/show/:showId` | 200 |

**List filters:** `?show_id=`, `?asistente_id=`  
**Editable fields in PATCH:** `show_id`. Sending any other field → 400.

### Create — `POST /api/inscripciones-meet`

```json
{
  "asistente_id": 6,
  "show_id": 1
}
```

### Example — `GET /api/inscripciones-meet/1`

```json
{
  "data": {
    "id": 1,
    "asistente_id": 1,
    "show_id": 5,
    "state": "ACTIVE"
  }
}
```

### `GET /api/inscripciones-meet/show/:showId`

Capacity (3), occupied, available, and list of registered attendees with their names. Show not found → 404.

```json
{
  "data": {
    "show_id": 5,
    "cupo": 3,
    "ocupados": 3,
    "disponibles": 0,
    "inscritos": [
      {
        "asistente_id": 1,
        "nombre": "Valentina Restrepo"
      },
      {
        "asistente_id": 4,
        "nombre": "Juan Pablo Arango"
      }
    ]
  }
}
```

## Validations → 400 / 404

- `asistente_id` and `show_id` are required integers; if they do not exist → 404.

## Business rules → 409

1. An active **VIP or PLATINO** ticket for the show day is required.
2. One active registration per attendee and show. If canceled, they can register again.
3. Maximum **3 registrants** per show.
4. The same rules also apply when moving the registration to another show with `PATCH`.

## Tips

- The rules live in the **use case** (`application/`), not in the controller. The use case queries the repository before deciding.
- Check the preloaded data table to see which records the tests use (section *Preloaded data* in CONVENTIONS.md) and **do not modify them manually**.
- Run the public tests continuously. Each red test tells you which request failed and what your API responded.
