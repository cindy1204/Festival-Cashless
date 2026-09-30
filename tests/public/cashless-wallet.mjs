import { pruebasListado } from '../lib.mjs';
const R = '/api/movimientos';
const saldo = async (api, espera, a) => Number(espera.item(await api.get(`/api/billeteras/${a}/saldo`)).saldo);
export default [
  ...pruebasListado(R),
  { nombre: 'Filter ?asistente_id=1 returns only that attendee movements', prueba: async ({ api, espera }) => {
    const b = espera.lista(await api.get(`${R}?asistente_id=1&limit=50`));
    espera.cierto(b.data.length >= 2 && b.data.every((x) => x.asistente_id === 1), 'All movements must belong to attendee 1');
  } },
  { nombre: 'GET /api/billeteras/1/saldo calculates 150000', prueba: async ({ api, espera }) =>
    espera.igual(await saldo(api, espera, 1), 150000, 'balance for attendee 1') },
  { nombre: 'POST without a body returns 400', prueba: async ({ api, espera }) => espera.error(await api.post(R, {}), 400) },
  { nombre: 'Valid RECARGA POST (201) increases the balance', prueba: async ({ api, ctx, espera }) => {
    ctx.saldoInicial = await saldo(api, espera, 2);
    const x = espera.item(await api.post(R, { asistente_id: 2, tipo: 'RECARGA', monto: 50000, descripcion: 'Test recharge' }), 201);
    ctx.recarga = x.id;
    espera.igual(await saldo(api, espera, 2), ctx.saldoInicial + 50000, 'balance after recharge');
  } },
  { nombre: 'Valid CONSUMO POST (201) deducts from the balance', prueba: async ({ api, ctx, espera }) => {
    const x = espera.item(await api.post(R, { asistente_id: 2, tipo: 'CONSUMO', monto: 30000 }), 201);
    ctx.consumo = x.id;
    espera.igual(await saldo(api, espera, 2), ctx.saldoInicial + 20000, 'balance after purchase');
  } },
  { nombre: 'Rule: a purchase cannot make the balance negative (409)', prueba: async ({ api, ctx, espera }) =>
    espera.error(await api.post(R, { asistente_id: 2, tipo: 'CONSUMO', monto: ctx.saldoInicial + 30000 }), 409) },
  { nombre: 'Rule: a recharge cannot be canceled if the balance would become negative (409)', prueba: async ({ api, ctx, espera }) => {
    if (ctx.saldoInicial >= 30000) return; // Applies only if attendee 2 started with a low balance.
    espera.error(await api.del(`${R}/${ctx.recarga}`), 409);
  } },
  { nombre: 'DELETE cancels the purchase and then the recharge', prueba: async ({ api, ctx, espera }) => {
    espera.status(await api.del(`${R}/${ctx.consumo}`), 200);
    espera.status(await api.del(`${R}/${ctx.recarga}`), 200);
    espera.error(await api.get(`${R}/${ctx.recarga}`), 404);
    espera.igual(await saldo(api, espera, 2), ctx.saldoInicial, 'final balance');
  } },
];
