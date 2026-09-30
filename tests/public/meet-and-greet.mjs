import { pruebasListado } from '../lib.mjs';
const R = '/api/inscripciones-meet';
export default [
  ...pruebasListado(R),
  { nombre: 'Filter ?show_id=5 returns the 3 registrations for the Morat show', prueba: async ({ api, espera }) => {
    const b = espera.lista(await api.get(`${R}?show_id=5`));
    espera.igual(b.pagination.total, 3, 'pagination.total'); espera.cierto(b.data.every((x) => x.show_id === 5), 'All registrations must belong to show 5');
  } },
  { nombre: 'GET /api/inscripciones-meet/1 returns the registration', prueba: async ({ api, espera }) => {
    const x = espera.item(await api.get(`${R}/1`));
    espera.igual(x.asistente_id, 1, 'asistente_id'); espera.igual(x.show_id, 5, 'show_id');
  } },
  { nombre: 'POST without a body returns 400', prueba: async ({ api, espera }) => espera.error(await api.post(R, {}), 400) },
  { nombre: 'Valid POST registers a VIP attendee (201)', prueba: async ({ api, ctx, espera }) => {
    const x = espera.item(await api.post(R, { asistente_id: 6, show_id: 1 }), 201);
    espera.igual(x.show_id, 1, 'show_id'); ctx.ins = x.id;
  } },
  { nombre: 'Rule: one registration per attendee and show (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 6, show_id: 1 }), 409) },
  { nombre: 'Rule: a VIP or PLATINO ticket for the show day is required (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 2, show_id: 1 }), 409) },
  { nombre: 'Rule: maximum 3 registrations per show (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 18, show_id: 5 }), 409) },
  { nombre: 'GET /api/inscripciones-meet/show/5 reports that capacity is full', prueba: async ({ api, espera }) => {
    const x = espera.item(await api.get(`${R}/show/5`));
    espera.numero(x.cupo, 3, 'cupo'); espera.numero(x.ocupados, 3, 'ocupados'); espera.numero(x.disponibles, 0, 'disponibles');
    espera.cierto(Array.isArray(x.inscritos) && x.inscritos.length === 3 && x.inscritos.every((i) => typeof i.nombre === 'string'), 'inscritos must be an array of 3 entries, each with the attendee name');
  } },
  { nombre: 'DELETE performs a soft delete and subsequent GET returns 404', prueba: async ({ api, ctx, espera }) => {
    espera.status(await api.del(`${R}/${ctx.ins}`), 200);
    espera.error(await api.get(`${R}/${ctx.ins}`), 404);
  } },
];
