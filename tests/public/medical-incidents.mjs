import { pruebasListado } from '../lib.mjs';
const R = '/api/incidentes';
const estado = (api, id, e) => api.patch(`${R}/${id}/estado`, { estado: e });
export default [
  ...pruebasListado(R),
  { nombre: 'Filter ?estado=ABIERTO returns only open incidents', prueba: async ({ api, espera }) => {
    const b = espera.lista(await api.get(`${R}?estado=ABIERTO&limit=50`));
    espera.cierto(b.data.length >= 1 && b.data.every((x) => x.estado === 'ABIERTO'), 'All incidents must be ABIERTO');
  } },
  { nombre: 'GET /api/incidentes/2 returns the incident', prueba: async ({ api, espera }) =>
    espera.igual(espera.item(await api.get(`${R}/2`)).estado, 'EN_ATENCION', 'estado') },
  { nombre: 'GET /api/incidentes/resumen?dia_id=1 counts incidents by state', prueba: async ({ api, espera }) => {
    const r = espera.item(await api.get(`${R}/resumen?dia_id=1`));
    espera.numero(r.ABIERTO, 1, 'ABIERTO'); espera.numero(r.EN_ATENCION, 1, 'EN_ATENCION'); espera.numero(r.CERRADO, 0, 'CERRADO');
  } },
  { nombre: 'POST without a body returns 400', prueba: async ({ api, espera }) => espera.error(await api.post(R, {}), 400) },
  { nombre: 'Valid POST creates an ABIERTO incident (201)', prueba: async ({ api, ctx, espera }) => {
    const x = espera.item(await api.post(R, { zona_id: 7, dia_id: 3, severidad: 'LEVE', descripcion: 'Heat exhaustion in the restroom line' }), 201);
    espera.igual(x.estado, 'ABIERTO', 'estado inicial'); ctx.inc = x.id;
  } },
  { nombre: 'Rule: cannot skip from ABIERTO to CERRADO (409)', prueba: async ({ api, ctx, espera }) =>
    espera.error(await estado(api, ctx.inc, 'CERRADO'), 409) },
  { nombre: 'Transition ABIERTO → EN_ATENCION', prueba: async ({ api, ctx, espera }) =>
    espera.igual(espera.item(await estado(api, ctx.inc, 'EN_ATENCION')).estado, 'EN_ATENCION', 'estado') },
  { nombre: 'Rule: cannot revert to ABIERTO (409)', prueba: async ({ api, ctx, espera }) =>
    espera.error(await estado(api, ctx.inc, 'ABIERTO'), 409) },
  { nombre: 'Transition EN_ATENCION → CERRADO', prueba: async ({ api, ctx, espera }) =>
    espera.igual(espera.item(await estado(api, ctx.inc, 'CERRADO')).estado, 'CERRADO', 'estado') },
  { nombre: 'Rule: a CERRADO incident cannot be edited (409)', prueba: async ({ api, ctx, espera }) =>
    espera.error(await api.patch(`${R}/${ctx.inc}`, { descripcion: 'Attempt to edit a closed incident' }), 409) },
];
