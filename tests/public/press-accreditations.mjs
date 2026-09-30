import { pruebasListado } from '../lib.mjs';
const R = '/api/acreditaciones';
export default [
  ...pruebasListado(R),
  { nombre: 'Filter ?tipo=FOTOGRAFO', prueba: async ({ api, espera }) => {
    const b = espera.lista(await api.get(`${R}?tipo=FOTOGRAFO&limit=50`));
    espera.cierto(b.data.length >= 5 && b.data.every((x) => x.tipo === 'FOTOGRAFO'), 'All records must have tipo FOTOGRAFO');
  } },
  { nombre: 'GET /api/acreditaciones/1 returns the accreditation', prueba: async ({ api, espera }) =>
    espera.igual(espera.item(await api.get(`${R}/1`)).email, 'laura.gomez@elespectador.com', 'email') },
  { nombre: 'POST without a body returns 400', prueba: async ({ api, espera }) => espera.error(await api.post(R, {}), 400) },
  { nombre: 'Valid POST creates the PENDIENTE application (201)', prueba: async ({ api, ctx, espera }) => {
    const x = espera.item(await api.post(R, { nombre: 'Pedro Mora', medio: 'Semana', email: 'pedro.mora@semana.com', tipo: 'PRENSA', dia_id: 2 }), 201);
    espera.igual(x.estado, 'PENDIENTE', 'estado inicial'); ctx.acr = x.id;
  } },
  { nombre: 'Rule: an email cannot receive two accreditations on the same day (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { nombre: 'Pedro Mora', medio: 'Semana', email: 'pedro.mora@semana.com', tipo: 'INFLUENCER', dia_id: 2 }), 409) },
  { nombre: 'Rule: maximum 5 photographers per stage and day (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { nombre: 'Lina Soto', medio: 'Cartel Urbano', email: 'lina.soto@cartelurbano.com', tipo: 'FOTOGRAFO', dia_id: 1, escenario_id: 1 }), 409) },
  { nombre: 'POST for a FOTOGRAFO without a stage returns 400', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { nombre: 'Lina Soto', medio: 'Cartel Urbano', email: 'lina.soto@cartelurbano.com', tipo: 'FOTOGRAFO', dia_id: 2 }), 400) },
  { nombre: 'Rejecting without a reason returns 400', prueba: async ({ api, ctx, espera }) =>
    espera.error(await api.patch(`${R}/${ctx.acr}/estado`, { estado: 'RECHAZADA' }), 400) },
  { nombre: 'Rejecting with a reason changes the state', prueba: async ({ api, ctx, espera }) =>
    espera.igual(espera.item(await api.patch(`${R}/${ctx.acr}/estado`, { estado: 'RECHAZADA', motivo: 'Publication not verified' })).estado, 'RECHAZADA', 'estado') },
  { nombre: 'Rule: only a PENDIENTE application can be decided (409)', prueba: async ({ api, ctx, espera }) =>
    espera.error(await api.patch(`${R}/${ctx.acr}/estado`, { estado: 'APROBADA' }), 409) },
  { nombre: 'DELETE performs a soft delete and subsequent GET returns 404', prueba: async ({ api, ctx, espera }) => {
    espera.status(await api.del(`${R}/${ctx.acr}`), 200);
    espera.error(await api.get(`${R}/${ctx.acr}`), 404);
  } },
];
