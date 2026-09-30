import { pruebasListado } from '../lib.mjs';
const R = '/api/resenas';
export default [
  ...pruebasListado(R),
  { nombre: 'Filter ?show_id=1 returns reviews for that show only', prueba: async ({ api, espera }) => {
    const b = espera.lista(await api.get(`${R}?show_id=1&limit=50`));
    espera.cierto(b.data.length >= 3 && b.data.every((x) => x.show_id === 1), 'All reviews must belong to show 1');
  } },
  { nombre: 'GET /api/resenas/1 returns the review', prueba: async ({ api, espera }) =>
    espera.igual(espera.item(await api.get(`${R}/1`)).puntaje, 5, 'puntaje') },
  { nombre: 'GET /api/resenas/show/1/promedio calculates 4.67 from 3 reviews', prueba: async ({ api, espera }) => {
    const p = espera.item(await api.get(`${R}/show/1/promedio`));
    espera.numero(p.promedio, 4.67, 'promedio (2 decimales)'); espera.numero(p.total, 3, 'total');
  } },
  { nombre: 'POST without a body returns 400', prueba: async ({ api, espera }) => espera.error(await api.post(R, {}), 400) },
  { nombre: 'Valid POST creates the review (201)', prueba: async ({ api, ctx, espera }) => {
    const x = espera.item(await api.post(R, { asistente_id: 5, show_id: 1, puntaje: 4, comentario: 'Great Friday finale' }), 201);
    espera.igual(x.puntaje, 4, 'puntaje'); ctx.resena = x.id;
  } },
  { nombre: 'Rule: one review per attendee and show (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 5, show_id: 1, puntaje: 5 }), 409) },
  { nombre: 'Rule: only an attendee with a ticket for the show day can review (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 16, show_id: 1, puntaje: 5 }), 409) },
  { nombre: 'POST with a score of 6 returns 400', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 7, show_id: 1, puntaje: 6 }), 400) },
  { nombre: 'PATCH updates the score', prueba: async ({ api, ctx, espera }) =>
    espera.igual(espera.item(await api.patch(`${R}/${ctx.resena}`, { puntaje: 5 })).puntaje, 5, 'puntaje') },
  { nombre: 'DELETE performs a soft delete and subsequent GET returns 404', prueba: async ({ api, ctx, espera }) => {
    espera.status(await api.del(`${R}/${ctx.resena}`), 200);
    espera.error(await api.get(`${R}/${ctx.resena}`), 404);
  } },
];
