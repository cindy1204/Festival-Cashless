import { pruebasListado } from '../lib.mjs';
const R = '/api/turnos';
const horas = async (api, espera, v, d) => Number(espera.item(await api.get(`${R}/voluntario/${v}/horas?dia_id=${d}`)).horas);
export default [
  ...pruebasListado(R),
  { nombre: 'Filter ?voluntario_id=1 returns only that volunteer shifts', prueba: async ({ api, espera }) => {
    const b = espera.lista(await api.get(`${R}?voluntario_id=1&limit=50`));
    espera.cierto(b.data.length >= 2 && b.data.every((x) => x.voluntario_id === 1), 'All shifts must belong to volunteer 1');
  } },
  { nombre: 'GET /api/turnos/1 returns the shift', prueba: async ({ api, espera }) => {
    const x = espera.item(await api.get(`${R}/1`));
    espera.igual(x.hora_inicio, '10:00', 'hora_inicio'); espera.igual(x.rol, 'LOGISTICA', 'rol');
  } },
  { nombre: 'POST without a body returns 400', prueba: async ({ api, espera }) => espera.error(await api.post(R, {}), 400) },
  { nombre: 'GET /api/turnos/voluntario/1/horas?dia_id=1 totals 7 hours', prueba: async ({ api, espera }) =>
    espera.igual(await horas(api, espera, 1, 1), 7, 'hours worked by volunteer 1 on Friday') },
  { nombre: 'Rule: a volunteer cannot work more than 8 hours per day (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { voluntario_id: 1, zona_id: 7, dia_id: 1, hora_inicio: '19:00', hora_fin: '21:00', rol: 'LOGISTICA' }), 409) },
  { nombre: 'Valid POST brings the total to exactly 8 hours (201)', prueba: async ({ api, ctx, espera }) => {
    const x = espera.item(await api.post(R, { voluntario_id: 1, zona_id: 7, dia_id: 1, hora_inicio: '19:00', hora_fin: '20:00', rol: 'LOGISTICA' }), 201);
    ctx.turno = x.id; espera.igual(await horas(api, espera, 1, 1), 8, 'hours after the new shift');
  } },
  { nombre: 'Rule: a volunteer cannot have overlapping shifts (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { voluntario_id: 2, zona_id: 8, dia_id: 1, hora_inicio: '15:00', hora_fin: '17:00', rol: 'ASEO' }), 409) },
  { nombre: 'POST with an invalid role returns 400', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { voluntario_id: 5, zona_id: 7, dia_id: 2, hora_inicio: '10:00', hora_fin: '11:00', rol: 'DJ' }), 400) },
  { nombre: 'PATCH changes the role', prueba: async ({ api, ctx, espera }) =>
    espera.igual(espera.item(await api.patch(`${R}/${ctx.turno}`, { rol: 'ASEO' })).rol, 'ASEO', 'rol') },
  { nombre: 'DELETE performs a soft delete and hours return to 7', prueba: async ({ api, ctx, espera }) => {
    espera.status(await api.del(`${R}/${ctx.turno}`), 200);
    espera.error(await api.get(`${R}/${ctx.turno}`), 404);
    espera.igual(await horas(api, espera, 1, 1), 7, 'hours after deletion');
  } },
];
