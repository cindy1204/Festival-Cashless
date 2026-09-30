import { pruebasListado } from '../lib.mjs';
const R = '/api/reservas-parqueadero';
export default [
  ...pruebasListado(R),
  { nombre: 'Filter ?dia_id=1&zona_id=4 returns the only motorcycle reservation', prueba: async ({ api, espera }) => {
    const b = espera.lista(await api.get(`${R}?dia_id=1&zona_id=4`));
    espera.igual(b.pagination.total, 1, 'pagination.total'); espera.igual(b.data[0]?.zona_id, 4, 'zona_id');
  } },
  { nombre: 'GET /api/reservas-parqueadero/2 returns the reservation', prueba: async ({ api, espera }) =>
    espera.igual(espera.item(await api.get(`${R}/2`)).placa, 'KJH345', 'placa') },
  { nombre: 'POST without a body returns 400', prueba: async ({ api, espera }) => espera.error(await api.post(R, {}), 400) },
  { nombre: 'Valid POST creates the reservation (201)', prueba: async ({ api, ctx, espera }) => {
    const x = espera.item(await api.post(R, { asistente_id: 5, zona_id: 3, dia_id: 1, placa: 'XYZ123', tipo_vehiculo: 'CARRO' }), 201);
    espera.igual(x.placa, 'XYZ123', 'placa'); ctx.reserva = x.id;
  } },
  { nombre: 'Rule: a license plate can only be reserved once per day (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 6, zona_id: 3, dia_id: 1, placa: 'XYZ123', tipo_vehiculo: 'CARRO' }), 409) },
  { nombre: 'Rule: a reservation cannot exceed zone capacity for that day (409)', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 7, zona_id: 4, dia_id: 1, placa: 'QWE45R', tipo_vehiculo: 'MOTO' }), 409) },
  { nombre: 'POST with a malformed license plate returns 400', prueba: async ({ api, espera }) =>
    espera.error(await api.post(R, { asistente_id: 7, zona_id: 3, dia_id: 2, placa: 'ABC-123', tipo_vehiculo: 'CARRO' }), 400) },
  { nombre: 'GET /api/reservas-parqueadero/placa/KJH345 lists reservations for that plate', prueba: async ({ api, espera }) => {
    const data = espera.arreglo(await api.get(`${R}/placa/KJH345`));
    espera.cierto(data.length >= 1 && data.every((x) => x.placa === 'KJH345'), 'All reservations must use plate KJH345');
  } },
  { nombre: 'PATCH moves the reservation to Saturday', prueba: async ({ api, ctx, espera }) =>
    espera.igual(espera.item(await api.patch(`${R}/${ctx.reserva}`, { dia_id: 2 })).dia_id, 2, 'dia_id') },
  { nombre: 'DELETE performs a soft delete and subsequent GET returns 404', prueba: async ({ api, ctx, espera }) => {
    espera.status(await api.del(`${R}/${ctx.reserva}`), 200);
    espera.error(await api.get(`${R}/${ctx.reserva}`), 404);
  } },
];
