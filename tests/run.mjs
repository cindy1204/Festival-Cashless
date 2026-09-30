// Manual acceptance kit. It talks to a running server over http on purpose,
// so it is not part of npm test and no pipeline may call it.
#!/usr/bin/env node
// Runs the official tests for a module against your API.
//
//   node tests/run.mjs <module> [url]
//   node tests/run.mjs boleteria http://localhost:3000
//
// Options (used by the instructor): --ocultas <folder>  --json <file>  --sin-publicas

import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crearApi, espera } from './lib.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opcion = (nombre) => { const i = args.indexOf(nombre); if (i === -1) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const bandera = (nombre) => { const i = args.indexOf(nombre); if (i === -1) return false; args.splice(i, 1); return true; };

const dirOcultas = opcion('--ocultas');
const archivoJson = opcion('--json');
const sinPublicas = bandera('--sin-publicas');
const [modulo, url = 'http://localhost:3000'] = args;

const archivosPublicos = {
  acreditaciones: 'press-accreditations',
  billetera: 'cashless-wallet',
  boleteria: 'box-office',
  camping: 'camping',
  comida: 'food',
  incidentes: 'medical-incidents',
  'meet-greet': 'meet-and-greet',
  merch: 'merch',
  'objetos-perdidos': 'lost-items',
  parqueadero: 'parking',
  programacion: 'show-programming',
  reportes: 'reports',
  resenas: 'show-reviews',
  transporte: 'transport',
  voluntarios: 'volunteer-shifts',
};
const disponibles = Object.keys(archivosPublicos).sort();
if (!modulo || !disponibles.includes(modulo)) {
  console.log('Usage: node tests/run.mjs <module> [url]\n');
  console.log('Modules:', disponibles.join(', '));
  process.exit(1);
}

const cargar = async (archivo) => (await import(pathToFileURL(archivo).href)).default;
const suites = [];
if (!sinPublicas) suites.push({ nombre: 'public', pruebas: await cargar(join(aqui, 'public', `${archivosPublicos[modulo]}.mjs`)) });
if (dirOcultas) {
  const archivo = resolve(dirOcultas, `${modulo}.mjs`);
  if (existsSync(archivo)) suites.push({ nombre: 'hidden', pruebas: await cargar(archivo) });
}

const verde = (t) => `\x1b[32m${t}\x1b[0m`, rojo = (t) => `\x1b[31m${t}\x1b[0m`, gris = (t) => `\x1b[90m${t}\x1b[0m`;
const api = crearApi(url);
const ctx = {};
const resultado = { modulo, url, fecha: new Date().toISOString(), suites: {} };

console.log(`\n🎪 Festival Picnic 2026 — module ${modulo} against ${url}\n`);
for (const suite of suites) {
  let ok = 0;
  const detalle = [];
  console.log(gris(`— ${suite.nombre} tests (${suite.pruebas.length})`));
  for (const p of suite.pruebas) {
    try {
      await p.prueba({ api, ctx, espera });
      ok++;
      detalle.push({ nombre: p.nombre, ok: true });
      console.log(`  ${verde('✓')} ${p.nombre}`);
    } catch (e) {
      detalle.push({ nombre: p.nombre, ok: false, error: e.message });
      console.log(`  ${rojo('✗')} ${p.nombre}\n      ${gris(e.message)}`);
    }
  }
  resultado.suites[suite.nombre] = { total: suite.pruebas.length, aprobadas: ok, detalle };
  console.log(`  ${ok}/${suite.pruebas.length} passed\n`);
}

if (archivoJson) await writeFile(archivoJson, JSON.stringify(resultado, null, 2));
const todas = Object.values(resultado.suites);
const total = todas.reduce((a, s) => a + s.total, 0), aprobadas = todas.reduce((a, s) => a + s.aprobadas, 0);
console.log(aprobadas === total ? verde(`🏆 ${aprobadas}/${total} — all tests passed!`) : `Result: ${aprobadas}/${total}`);
