import { pruebasListado } from '../lib.mjs';
const R = '/api/reservas-camping';
export default [
  ...pruebasListado(R),
  { nombre: 'Filter ?zona_id=2 returns the 2 VIP Camping tents', prueba: async ({ api, espera }) => {
    const b = espera.lista(await api.get(`${R}?zona_id=2`));
    espera.igual(b.pagination.total, 2, 'pagination.total'); espera.cierto(b.data.every((x) => x.zona_id === 2), 'All reservations must belong to zone 2');
  } },
  { nombre: 'GET /api/reservas-camping/1 returns the reservation', prueba: async ({ api, espera }) =>
    espera.igual(espera.item(await api.get(`${R}/1`)).asistente_id, 3, 'asistente_id') },
  { nombre: 'POST without a body returns 400', prueba: async ({ api, espera }) => espera.error(await api.post(R, {}), 400) },
  { nombre: 'Valid POST creates the reservation (201)', prueba: async ({ api, ctx, espera }) => {
    const x = espera.item(await api.post(R, { asistente_id: 7, zona_id: 1, fecha_entrada: '2026-11-20', fecha_salida: '2026-11-22', personas: 3 }), 201);
    espera.igual(x.personas, 3, 'personas'); ctx.reserva = x.id;
  } },
  { nombre: 'Rule: an attendee can have only one camping reservation (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 7, zona_id: 1, fecha_entrada: '2026-11-21', fecha_salida: '2026-11-22', personas: 1 }), 409) },
  { nombre: 'Rule: a minor cannot camp (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 19, zona_id: 1, fecha_entrada: '2026-11-20', fecha_salida: '2026-11-21', personas: 1 }), 409) },
  { nombre: 'Rule: a reservation cannot be made in a full zone (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 8, zona_id: 2, fecha_entrada: '2026-11-20', fecha_salida: '2026-11-21', personas: 2 }), 409) },
  { nombre: 'POST with reversed dates returns 400', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 8, zona_id: 1, fecha_entrada: '2026-11-22', fecha_salida: '2026-11-20', personas: 2 }), 400) },
  { nombre: 'GET /api/reservas-camping/zona/2/ocupacion reports that the zone is full', prueba: async ({ api, espera }) => {
    const o = espera.item(await api.get(`${R}/zona/2/ocupacion`));
    espera.numero(o.capacidad, 2, 'capacidad'); espera.numero(o.ocupadas, 2, 'ocupadas'); espera.numero(o.disponibles, 0, 'disponibles');
  } },
  { nombre: 'PATCH updates the number of people', prueba: async ({ api, ctx, espera }) =>
    espera.igual(espera.item(await api.patch(`${R}/${ctx.reserva}`, { personas: 4 })).personas, 4, 'personas') },
  { nombre: 'DELETE performs a soft delete and subsequent GET returns 404', prueba: async ({ api, ctx, espera }) => {
    espera.status(await api.del(`${R}/${ctx.reserva}`), 200);
    espera.error(await api.get(`${R}/${ctx.reserva}`), 404);
  } },
];
