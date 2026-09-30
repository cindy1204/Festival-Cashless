import { pruebasListado } from '../lib.mjs';
const R = '/api/pedidos-comida', P = '/api/productos-comida';
const stock = async (api, espera, id) => Number(espera.item(await api.get(`${P}/${id}`)).stock);
export default [
  ...pruebasListado(R),
  { nombre: 'GET /api/productos-comida?zona_id=6 lists Food Trucks products', prueba: async ({ api, espera }) => {
    const b = espera.lista(await api.get(`${P}?zona_id=6`));
    espera.cierto(b.data.length >= 3 && b.data.every((x) => x.zona_id === 6), 'All products must belong to zone 6');
  } },
  { nombre: 'GET /api/productos-comida/2 returns price and stock', prueba: async ({ api, ctx, espera }) => {
    const x = espera.item(await api.get(`${P}/2`));
    espera.numero(x.precio, 28000, 'precio'); ctx.stockInicial = Number(x.stock);
  } },
  { nombre: 'POST without a body returns 400', prueba: async ({ api, espera }) => espera.error(await api.post(R, {}), 400) },
  { nombre: 'Valid POST creates the order and calculates the total (201)', prueba: async ({ api, ctx, espera }) => {
    const x = espera.item(await api.post(R, { asistente_id: 5, producto_id: 2, cantidad: 2 }), 201);
    espera.numero(x.total, 56000, 'total'); espera.igual(x.estado, 'PENDIENTE', 'estado'); ctx.pedido = x.id;
  } },
  { nombre: 'Rule: creating an order reduces stock', prueba: async ({ api, ctx, espera }) =>
    espera.igual(await stock(api, espera, 2), ctx.stockInicial - 2, 'stock del producto 2') },
  { nombre: 'Rule: an order cannot exceed available stock (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 5, producto_id: 5, cantidad: 1 }), 409) },
  { nombre: 'POST with quantity 0 returns 400', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 5, producto_id: 1, cantidad: 0 }), 400) },
  { nombre: 'DELETE cancels the order and restores stock', prueba: async ({ api, ctx, espera }) => {
    espera.status(await api.del(`${R}/${ctx.pedido}`), 200);
    espera.error(await api.get(`${R}/${ctx.pedido}`), 404);
    espera.igual(await stock(api, espera, 2), ctx.stockInicial, 'product 2 stock after cancellation');
  } },
  { nombre: 'PATCH marks an order as ENTREGADO', prueba: async ({ api, ctx, espera }) => {
    const x = espera.item(await api.post(R, { asistente_id: 6, producto_id: 4, cantidad: 1 }), 201);
    ctx.entregado = x.id;
    espera.igual(espera.item(await api.patch(`${R}/${x.id}`, { estado: 'ENTREGADO' })).estado, 'ENTREGADO', 'estado');
  } },
  { nombre: 'PATCH with an invalid state returns 400', prueba: async ({ api, ctx, espera }) =>
    espera.error(await api.patch(`${R}/${ctx.entregado}`, { estado: 'COCINANDO' }), 400) },
  { nombre: 'Filter ?estado=PENDIENTE returns only pending orders', prueba: async ({ api, espera }) => {
    const b = espera.lista(await api.get(`${R}?estado=PENDIENTE&limit=50`));
    espera.cierto(b.data.length >= 1 && b.data.every((x) => x.estado === 'PENDIENTE'), 'All orders must be PENDIENTE');
  } },
];
