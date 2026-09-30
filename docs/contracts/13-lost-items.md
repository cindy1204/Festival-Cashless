# Module 13 — Lost items

**Difficulty:** ★☆☆ Basic — recommended if you work alone  
**Tests:** `node tests/run.mjs objetos-perdidos http://localhost:3000`

> The lost-and-found warehouse: items are registered and returned to their owner after verifying their document.

Read [CONVENTIONS.md](CONVENTIONS.md) first: the response format, pagination, and error codes apply to all modules.

## Tables

**Your team writes in** (and only in these):

### `objetos_perdidos`

| Column | Type | Required |
|---|---|---|
| `id` | int | yes *(automatic)* |
| `descripcion` | varchar(300) | yes |
| `categoria` | varchar(15) | yes |
| `zona_id` | int | yes |
| `dia_id` | int | yes |
| `voluntario_id` | int | yes |
| `estado` | varchar(10) | yes |
| `reclamado_por_asistente_id` | int | no |
| `fecha_entrega` | timestamptz | no |
| `state` | varchar(20) | yes *(automatic)* |

**Read-only** (preloaded data or other modules): `zonas`, `dias`, `voluntarios`, `asistentes`

## Endpoints

| Method | Route | Success |
|---|---|---|
| GET | `/api/objetos-perdidos` | 200 paginated |
| GET | `/api/objetos-perdidos/:id` | 200 |
| POST | `/api/objetos-perdidos` | 201 |
| PATCH | `/api/objetos-perdidos/:id` | 200 |
| DELETE | `/api/objetos-perdidos/:id` | 200 (logical delete) |
| POST | `/api/objetos-perdidos/:id/reclamar` | 200 |

**List filters:** `?categoria=`, `?estado=`, `?dia_id=`, `?zona_id=`  
**Editable fields in PATCH:** `descripcion`, `categoria`, `zona_id`. Sending any other field → 400.

### Create — `POST /api/objetos-perdidos`

```json
{
  "descripcion": "Gafas de sol negras",
  "categoria": "ACCESORIOS",
  "zona_id": 7,
  "dia_id": 1,
  "voluntario_id": 2
}
```

### Example — `GET /api/objetos-perdidos/1`

```json
{
  "data": {
    "id": 1,
    "descripcion": "Billetera negra de cuero",
    "categoria": "ACCESORIOS",
    "zona_id": 7,
    "dia_id": 1,
    "voluntario_id": 1,
    "estado": "EN_BODEGA",
    "reclamado_por_asistente_id": null,
    "fecha_entrega": null,
    "state": "ACTIVE"
  }
}
```

### `POST /api/objetos-perdidos/:id/reclamar`

Body: `{ "asistente_id": 5, "documento": "1037600105" }`. Responds 200 with the item in state `ENTREGADO`, `reclamado_por_asistente_id`, and `fecha_entrega`. Without a document → 400; object or attendee not found → 404.

## Validations → 400 / 404

- `zona_id`, `dia_id`, and `voluntario_id` (the one who found it) are required integers; if they do not exist → 404.
- `descripcion` must be between 5 and 300 characters.
- `categoria` is `DOCUMENTOS`, `ELECTRONICOS`, `ROPA`, `ACCESORIOS`, or `OTROS`.
- The item is created in state `EN_BODEGA`.

## Business rules → 409

1. To claim it, the submitted `documento` must match the attendee's document → if not, 409.
2. An `ENTREGADO` item cannot be claimed again, edited, or deleted → 409.

## Tips

- The rules live in the **use case** (`application/`), not in the controller. The use case queries the repository before deciding.
- Check the preloaded data table to see which records the tests use (section *Preloaded data* in CONVENTIONS.md) and **do not modify them manually**.
- Run the public tests continuously. Each red test tells you which request failed and what your API responded.
