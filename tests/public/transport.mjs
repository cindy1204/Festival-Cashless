import { pruebasListado } from '../lib.mjs';
const R = '/api/reservas-bus', B = '/api/buses';
export default [
  ...pruebasListado(R),
  { nombre: 'GET /api/buses?dia_id=1 lists Friday buses', prueba: async ({ api, espera }) => {
    const b = espera.lista(await api.get(`${B}?dia_id=1`));
    espera.cierto(b.data.length >= 4 && b.data.every((x) => x.dia_id === 1), 'All buses must belong to day 1');
  } },
  { nombre: 'GET /api/buses/2 returns the bus', prueba: async ({ api, espera }) =>
    espera.numero(espera.item(await api.get(`${B}/2`)).capacidad, 2, 'capacidad') },
  { nombre: 'POST without a body returns 400', prueba: async ({ api, espera }) => espera.error(await api.post(R, {}), 400) },
  { nombre: 'Valid POST reserves a seat (201)', prueba: async ({ api, ctx, espera }) => {
    const x = espera.item(await api.post(R, { asistente_id: 5, bus_id: 1 }), 201);
    espera.igual(x.bus_id, 1, 'bus_id'); ctx.reserva = x.id;
  } },
  { nombre: 'Rule: an attendee cannot reserve the same bus twice (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 5, bus_id: 1 }), 409) },
  { nombre: 'Rule: a seat cannot be reserved on a full bus (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 5, bus_id: 2 }), 409) },
  { nombre: 'Rule: a seat cannot be reserved on a bus that has departed (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 5, bus_id: 3 }), 409) },
  { nombre: 'Rule: a departed bus cannot return to PROGRAMADO (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.patch(`${B}/3/estado`, { estado: 'PROGRAMADO' }), 409) },
  { nombre: 'DELETE performs a soft delete and subsequent GET returns 404', prueba: async ({ api, ctx, espera }) => {
    espera.status(await api.del(`${R}/${ctx.reserva}`), 200);
    espera.error(await api.get(`${R}/${ctx.reserva}`), 404);
  } },
];
