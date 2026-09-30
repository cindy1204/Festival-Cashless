import { pruebasListado } from '../lib.mjs';
const R = '/api/boletas';
export default [
  ...pruebasListado(R),
  { nombre: 'Filter ?dia_id=4 returns the 3 Pre-party tickets', prueba: async ({ api, espera }) => {
    const b = espera.lista(await api.get(`${R}?dia_id=4&limit=50`));
    espera.igual(b.pagination.total, 3, 'pagination.total'); espera.cierto(b.data.every((x) => x.dia_id === 4), 'All tickets must belong to day 4');
  } },
  { nombre: 'GET /api/boletas/1 returns the ticket and its price', prueba: async ({ api, espera }) => {
    const x = espera.item(await api.get(`${R}/1`));
    espera.igual(x.tipo, 'GENERAL', 'tipo'); espera.numero(x.precio, 250000, 'precio');
  } },
  { nombre: 'POST without a body returns 400', prueba: async ({ api, espera }) => espera.error(await api.post(R, {}), 400) },
  { nombre: 'Valid POST sells the ticket and calculates its price (201)', prueba: async ({ api, ctx, espera }) => {
    const x = espera.item(await api.post(R, { asistente_id: 14, dia_id: 1, tipo: 'GENERAL' }), 201);
    espera.numero(x.precio, 250000, 'precio de GENERAL'); ctx.boleta = x.id;
  } },
  { nombre: 'Rule: an attendee cannot buy two tickets for the same day (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 14, dia_id: 1, tipo: 'VIP' }), 409) },
  { nombre: 'Rule: ticket sales cannot exceed the daily capacity (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 15, dia_id: 4, tipo: 'VIP' }), 409) },
  { nombre: 'POST with an invalid type returns 400', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 15, dia_id: 1, tipo: 'GOLD' }), 400) },
  { nombre: 'GET /api/boletas/dia/4/disponibilidad reports that capacity is full', prueba: async ({ api, espera }) => {
    const d = espera.item(await api.get(`${R}/dia/4/disponibilidad`));
    espera.numero(d.aforo, 3, 'aforo'); espera.numero(d.vendidas, 3, 'vendidas'); espera.numero(d.disponibles, 0, 'disponibles');
  } },
  { nombre: 'PATCH changes the ticket to VIP and recalculates its price', prueba: async ({ api, ctx, espera }) => {
    const x = espera.item(await api.patch(`${R}/${ctx.boleta}`, { tipo: 'VIP' }));
    espera.igual(x.tipo, 'VIP', 'tipo'); espera.numero(x.precio, 480000, 'precio de VIP');
  } },
  { nombre: 'DELETE performs a soft delete and subsequent GET returns 404', prueba: async ({ api, ctx, espera }) => {
    espera.status(await api.del(`${R}/${ctx.boleta}`), 200);
    espera.error(await api.get(`${R}/${ctx.boleta}`), 404);
  } },
];
