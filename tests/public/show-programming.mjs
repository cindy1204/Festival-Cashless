import { pruebasListado } from '../lib.mjs';
const R = '/api/shows';
export default [
  ...pruebasListado(R),
  { nombre: 'Filter ?dia_id=1 returns only Friday shows', prueba: async ({ api, espera }) => {
    const b = espera.lista(await api.get(`${R}?dia_id=1&limit=50`));
    espera.cierto(b.data.length >= 4 && b.data.every((s) => s.dia_id === 1), 'All shows must have dia_id 1');
  } },
  { nombre: 'GET /api/shows/1 returns the Bomba Estéreo show', prueba: async ({ api, espera }) => {
    const s = espera.item(await api.get(`${R}/1`));
    espera.igual(s.artista_id, 1, 'artista_id'); espera.igual(s.hora_inicio, '21:00', 'hora_inicio');
  } },
  { nombre: 'POST without a body returns 400', prueba: async ({ api, espera }) => espera.error(await api.post(R, {}), 400) },
  { nombre: 'Valid POST creates the show (201)', prueba: async ({ api, ctx, espera }) => {
    const s = espera.item(await api.post(R, { artista_id: 11, escenario_id: 4, dia_id: 2, hora_inicio: '14:00', hora_fin: '15:00' }), 201);
    espera.cierto(Number.isInteger(s.id), 'Response must include the id'); espera.igual(s.hora_fin, '15:00', 'hora_fin');
    ctx.show = s.id;
  } },
  { nombre: 'Rule: a stage cannot have overlapping shows (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { artista_id: 7, escenario_id: 1, dia_id: 1, hora_inicio: '21:30', hora_fin: '22:00' }), 409) },
  { nombre: 'Rule: an artist cannot perform twice on the same day (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { artista_id: 1, escenario_id: 4, dia_id: 1, hora_inicio: '12:00', hora_fin: '13:00' }), 409) },
  { nombre: 'POST with hora_fin before hora_inicio returns 400', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { artista_id: 7, escenario_id: 4, dia_id: 3, hora_inicio: '20:00', hora_fin: '19:00' }), 400) },
  { nombre: 'PATCH updates the end time', prueba: async ({ api, ctx, espera }) => {
    const s = espera.item(await api.patch(`${R}/${ctx.show}`, { hora_fin: '15:30' }));
    espera.igual(s.hora_fin, '15:30', 'hora_fin');
  } },
  { nombre: 'GET /api/shows/artista/1 lists the artist shows', prueba: async ({ api, espera }) => {
    const data = espera.arreglo(await api.get(`${R}/artista/1`));
    espera.cierto(data.some((s) => s.id === 1) && data.every((s) => s.artista_id === 1), 'Must include show 1 and only shows by artist 1');
  } },
  { nombre: 'DELETE performs a soft delete and subsequent GET returns 404', prueba: async ({ api, ctx, espera }) => {
    espera.status(await api.del(`${R}/${ctx.show}`), 200);
    espera.error(await api.get(`${R}/${ctx.show}`), 404);
  } },
];
