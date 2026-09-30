// Shared utilities for the festival tests. No dependencies required (Node 18+).

export class FalloPrueba extends Error {}

export function crearApi(baseUrl) {
  const base = baseUrl.replace(/\/$/, '');
  const pedir = async (metodo, ruta, cuerpo) => {
    const opciones = { method: metodo, headers: {}, signal: AbortSignal.timeout(8000) };
    if (cuerpo !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
    }
    let res;
    try {
      res = await fetch(base + ruta, opciones);
    } catch (e) {
      throw new FalloPrueba(`${metodo} ${ruta} → no response (${e.name === 'TimeoutError' ? 'request timed out' : 'server is down or route is invalid'})`);
    }
    const texto = await res.text();
    let body = null;
    try { body = texto ? JSON.parse(texto) : null; } catch { body = texto; }
    return { status: res.status, body, metodo, ruta };
  };
  return {
    get: (ruta) => pedir('GET', ruta),
    post: (ruta, cuerpo) => pedir('POST', ruta, cuerpo),
    patch: (ruta, cuerpo) => pedir('PATCH', ruta, cuerpo),
    del: (ruta) => pedir('DELETE', ruta),
  };
}

const resumen = (res) => {
  const b = typeof res.body === 'string' ? res.body.slice(0, 120) : JSON.stringify(res.body)?.slice(0, 160);
  return `${res.metodo} ${res.ruta} returned ${res.status} ${b ?? ''}`;
};

export const espera = {
  cierto(condicion, mensaje) {
    if (!condicion) throw new FalloPrueba(mensaje);
  },
  igual(actual, esperado, mensaje) {
    if (actual !== esperado) throw new FalloPrueba(`${mensaje}: expected ${JSON.stringify(esperado)}, received ${JSON.stringify(actual)}`);
  },
  numero(actual, esperado, mensaje) {
    if (Number(actual) !== esperado) throw new FalloPrueba(`${mensaje}: expected ${esperado}, received ${JSON.stringify(actual)}`);
  },
  status(res, codigo) {
    if (res.status !== codigo) throw new FalloPrueba(`Expected status ${codigo}. ${resumen(res)}`);
  },
  // Error response with a status code and body { error: "message" }.
  error(res, codigo) {
    espera.status(res, codigo);
    if (!res.body || typeof res.body.error !== 'string' || res.body.error.length === 0) {
      throw new FalloPrueba(`Status ${codigo} must return { "error": "message" }. ${resumen(res)}`);
    }
  },
  // Response { data: {...} } with an id.
  item(res, codigo = 200) {
    espera.status(res, codigo);
    if (!res.body || typeof res.body.data !== 'object' || res.body.data === null || Array.isArray(res.body.data)) {
      throw new FalloPrueba(`Response must have the shape { "data": { ... } }. ${resumen(res)}`);
    }
    return res.body.data;
  },
  // Paginated response { pagination: {...}, data: [...] }.
  lista(res, limite) {
    espera.status(res, 200);
    const b = res.body;
    if (!b || !Array.isArray(b.data) || typeof b.pagination !== 'object' || b.pagination === null) {
      throw new FalloPrueba(`Response must have the shape { "pagination": {...}, "data": [...] }. ${resumen(res)}`);
    }
    const p = b.pagination;
    for (const campo of ['total', 'currentPage', 'limit', 'totalPages']) {
      if (typeof p[campo] !== 'number') throw new FalloPrueba(`pagination.${campo} must be a number. ${resumen(res)}`);
    }
    const paginasEsperadas = Math.ceil(p.total / p.limit);
    if (p.totalPages !== paginasEsperadas) throw new FalloPrueba(`pagination.totalPages must be ceil(total / limit) = ${paginasEsperadas}, received ${p.totalPages}`);
    if (limite !== undefined) {
      if (p.limit !== limite) throw new FalloPrueba(`pagination.limit must be ${limite}, received ${p.limit}`);
      if (b.data.length > limite) throw new FalloPrueba(`Requested limit=${limite}, received ${b.data.length} records`);
    }
    return b;
  },
  // Response { data: [...] } without pagination.
  arreglo(res) {
    espera.status(res, 200);
    if (!res.body || !Array.isArray(res.body.data)) throw new FalloPrueba(`Response must have the shape { "data": [ ... ] }. ${resumen(res)}`);
    return res.body.data;
  },
};

// Generic list tests that apply to any paginated resource.
export function pruebasListado(ruta, { publicas = true } = {}) {
  if (publicas) {
    return [
      {
        nombre: `GET ${ruta}?page=1&limit=2 returns a paginated response`,
        prueba: async ({ api }) => {
          const b = espera.lista(await api.get(`${ruta}?page=1&limit=2`), 2);
          espera.igual(b.pagination.currentPage, 1, 'pagination.currentPage');
          espera.cierto(b.data.length > 0, 'The list should not be empty: preloaded data exists');
          espera.cierto(b.data.every((x) => x.state === undefined || x.state === 'ACTIVE'), 'The list must not include records with state REMOVED');
        },
      },
      {
        nombre: `GET ${ruta} without parameters defaults to page=1 and limit=10`,
        prueba: async ({ api }) => {
          const b = espera.lista(await api.get(ruta), 10);
          espera.igual(b.pagination.currentPage, 1, 'default pagination.currentPage');
        },
      },
      {
        nombre: `GET ${ruta}/abc returns 400 for an invalid id`,
        prueba: async ({ api }) => espera.error(await api.get(`${ruta}/abc`), 400),
      },
      {
        nombre: `GET ${ruta}/999999 returns 404`,
        prueba: async ({ api }) => espera.error(await api.get(`${ruta}/999999`), 404),
      },
    ];
  }
  return [
    { nombre: `GET ${ruta}?limit=0 returns 400`, prueba: async ({ api }) => espera.error(await api.get(`${ruta}?limit=0`), 400) },
    { nombre: `GET ${ruta}?limit=51 returns 400 (maximum 50)`, prueba: async ({ api }) => espera.error(await api.get(`${ruta}?limit=51`), 400) },
    { nombre: `GET ${ruta}?page=-1 returns 400`, prueba: async ({ api }) => espera.error(await api.get(`${ruta}?page=-1`), 400) },
    { nombre: `GET ${ruta}?limit=abc returns 400`, prueba: async ({ api }) => espera.error(await api.get(`${ruta}?limit=abc`), 400) },
    {
      nombre: `GET ${ruta}?page=2&limit=1 returns the second page`,
      prueba: async ({ api }) => {
        const b = espera.lista(await api.get(`${ruta}?page=2&limit=1`), 1);
        espera.igual(b.pagination.currentPage, 2, 'pagination.currentPage');
      },
    },
    { nombre: `PATCH ${ruta}/999999 returns 404`, prueba: async ({ api }) => espera.error(await api.patch(`${ruta}/999999`, {}), 404) },
    { nombre: `DELETE ${ruta}/999999 returns 404`, prueba: async ({ api }) => espera.error(await api.del(`${ruta}/999999`), 404) },
  ];
}
