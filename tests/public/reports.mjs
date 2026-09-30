// Reports are read-only. These tests verify response shape and consistency; exact values
// change during the festival because other teams add data.
const R = '/api/reportes';
const desc = (arr, campo) => arr.every((x, i) => i === 0 || Number(arr[i - 1][campo]) >= Number(x[campo]));
export default [
  { nombre: 'GET /api/reportes/ventas-por-dia returns all 4 days ordered by date', prueba: async ({ api, espera }) => {
    const d = espera.arreglo(await api.get(`${R}/ventas-por-dia`));
    espera.igual(d.length, 4, 'number of days'); espera.igual(d[0].dia_id, 4, 'the first day is Pre-party (Nov 19)');
    espera.cierto(d.every((x) => typeof x.nombre === 'string' && typeof x.boletas === 'number' && typeof x.ingresos === 'number'), 'Each day must include a name, ticket count, and numeric revenue');
  } },
  { nombre: 'GET /api/reportes/top-artistas?limit=3 sorts by average score', prueba: async ({ api, espera }) => {
    const d = espera.arreglo(await api.get(`${R}/top-artistas?limit=3`));
    espera.cierto(d.length > 0 && d.length <= 3, 'At most 3 artists');
    espera.cierto(d.every((x) => typeof x.nombre === 'string' && typeof x.promedio === 'number' && typeof x.resenas === 'number'), 'Each artist must include a name, average score, and numeric review count');
    espera.cierto(desc(d, 'promedio'), 'Results must be sorted by average score in descending order');
  } },
  { nombre: 'GET /api/reportes/top-artistas?limit=0 returns 400', prueba: async ({ api, espera }) =>
    espera.error(await api.get(`${R}/top-artistas?limit=0`), 400) },
  { nombre: 'GET /api/reportes/ocupacion/4 reports Pre-party at 100% occupancy', prueba: async ({ api, espera }) => {
    const o = espera.item(await api.get(`${R}/ocupacion/4`));
    espera.numero(o.aforo, 3, 'aforo'); espera.numero(o.vendidas, 3, 'vendidas'); espera.numero(o.porcentaje, 100, 'porcentaje');
  } },
  { nombre: 'GET /api/reportes/ocupacion/abc returns 400', prueba: async ({ api, espera }) =>
    espera.error(await api.get(`${R}/ocupacion/abc`), 400) },
  { nombre: 'GET /api/reportes/ocupacion/999 returns 404', prueba: async ({ api, espera }) =>
    espera.error(await api.get(`${R}/ocupacion/999`), 404) },
  { nombre: 'GET /api/reportes/escenarios/1/agenda?dia_id=1 includes Bomba Estéreo', prueba: async ({ api, espera }) => {
    const d = espera.arreglo(await api.get(`${R}/escenarios/1/agenda?dia_id=1`));
    espera.cierto(d.some((x) => x.show_id === 1 && x.artista === 'Bomba Estéreo'), 'Must include show 1 and the artist name');
    espera.cierto(d.every((x, i) => i === 0 || d[i - 1].hora_inicio <= x.hora_inicio), 'Results must be ordered by hora_inicio');
  } },
  { nombre: 'GET /api/reportes/escenarios/1/agenda without dia_id returns 400', prueba: async ({ api, espera }) =>
    espera.error(await api.get(`${R}/escenarios/1/agenda`), 400) },
  { nombre: 'GET /api/reportes/comida/top-productos sorts by units sold', prueba: async ({ api, espera }) => {
    const d = espera.arreglo(await api.get(`${R}/comida/top-productos`));
    espera.cierto(d.length >= 1 && d.every((x) => typeof x.unidades === 'number' && typeof x.ingresos === 'number'), 'Each product must include numeric units sold and revenue');
    espera.cierto(desc(d, 'unidades'), 'Results must be sorted by units sold in descending order');
  } },
];
