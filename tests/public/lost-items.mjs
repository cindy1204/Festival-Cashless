import { pruebasListado } from '../lib.mjs';
const R = '/api/objetos-perdidos';
export default [
  ...pruebasListado(R),
  { nombre: 'Filter ?categoria=ELECTRONICOS', prueba: async ({ api, espera }) => {
    const b = espera.lista(await api.get(`${R}?categoria=ELECTRONICOS&limit=50`));
    espera.cierto(b.data.length >= 1 && b.data.every((x) => x.categoria === 'ELECTRONICOS'), 'All items must have categoria ELECTRONICOS');
  } },
  { nombre: 'GET /api/objetos-perdidos/1 returns the item', prueba: async ({ api, espera }) =>
    espera.igual(espera.item(await api.get(`${R}/1`)).estado, 'EN_BODEGA', 'estado') },
  { nombre: 'POST without a body returns 400', prueba: async ({ api, espera }) => espera.error(await api.post(R, {}), 400) },
  { nombre: 'Valid POST registers an item as EN_BODEGA (201)', prueba: async ({ api, ctx, espera }) => {
    const x = espera.item(await api.post(R, { descripcion: 'Black sunglasses', categoria: 'ACCESORIOS', zona_id: 7, dia_id: 1, voluntario_id: 2 }), 201);
    espera.igual(x.estado, 'EN_BODEGA', 'estado inicial'); ctx.obj = x.id;
  } },
  { nombre: 'Rule: claiming with a mismatched document is rejected (409)', prueba: async ({ api, ctx, espera }) =>
    espera.error(await api.post(`${R}/${ctx.obj}/reclamar`, { asistente_id: 5, documento: '0000000000' }), 409) },
  { nombre: 'Claiming with the correct document hands over the item', prueba: async ({ api, ctx, espera }) => {
    const x = espera.item(await api.post(`${R}/${ctx.obj}/reclamar`, { asistente_id: 5, documento: '1037600105' }));
    espera.igual(x.estado, 'ENTREGADO', 'estado'); espera.igual(x.reclamado_por_asistente_id, 5, 'reclamado_por_asistente_id');
  } },
  { nombre: 'Rule: a delivered item cannot be claimed again (409)', prueba: async ({ api, ctx, espera }) =>
    espera.error(await api.post(`${R}/${ctx.obj}/reclamar`, { asistente_id: 6, documento: '1037600106' }), 409) },
  { nombre: 'Rule: a delivered item cannot be deleted (409)', prueba: async ({ api, ctx, espera }) =>
    espera.error(await api.del(`${R}/${ctx.obj}`), 409) },
];
