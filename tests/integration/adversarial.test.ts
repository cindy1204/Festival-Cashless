import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import { call, cleanup, create, purge, saldo, TAG } from "../helpers/api.js";

const R = "/api/movimientos";

before(cleanup);
after(cleanup);

/** A 500 is a bug in this service: every request below is a client mistake. */
const neverServerError = async (method: string, path: string, body?: unknown) => {
  const { status, body: payload } = await call(method, path, body);
  assert.notEqual(status, 500, `${method} ${path} -> ${JSON.stringify(payload)}`);
  if (status >= 400) {
    assert.equal(typeof payload?.error, "string", "a failure keeps the envelope");
    assert.ok(payload.error.length > 0);
  }
  return { status, body: payload };
};

const expects = async (method: string, path: string, expected: number, body?: unknown, note = "") => {
  const response = await neverServerError(method, path, body);
  const because = note === "" ? "" : ` (${note})`;
  assert.equal(response.status, expected, `${method} ${path}${because} -> ${JSON.stringify(response.body)}`);
  return response.body;
};

test("numbers beyond the int range are refused, not passed to the driver", async (t) => {
  t.after(purge);
  for (const asistente_id of [2_147_483_648, 3_000_000_000, 2 ** 53, 2 ** 70, -(2 ** 31)]) {
    await expects("POST", R, 400, { asistente_id, tipo: "RECARGA", monto: 10_000 });
  }
  for (const id of [2_147_483_648, 3_000_000_000, 2 ** 53]) {
    await expects("GET", `${R}/${id}`, 400);
    await expects("PATCH", `${R}/${id}`, 400, { descripcion: "x" });
    await expects("DELETE", `${R}/${id}`, 400);
  }
  await expects("GET", `${R}/2147483647`, 404, undefined, "the largest storable id is a number, so it is a lookup");
});

test("amounts beyond the int range are refused on both operations", async (t) => {
  t.after(purge);
  for (const monto of [2_147_483_648, 2 ** 53, 1e308]) {
    await expects("POST", R, 400, { asistente_id: 2, tipo: "CONSUMO", monto });
    await expects("POST", R, 400, { asistente_id: 2, tipo: "RECARGA", monto });
  }
});

test("a page whose offset cannot be stored is refused", async (t) => {
  t.after(purge);
  await expects("GET", `${R}?page=2147483647&limit=50`, 400);
  await expects("GET", `${R}?page=99999999999999999999`, 400);
  await expects("GET", `${R}?page=42949673&limit=50`, 200, undefined, "just inside the range is a real page");
});

test("malformed and hostile bodies are answered, not crashed on", async (t) => {
  t.after(purge);
  for (const body of [[1, 2, 3], "text", 42, true, { toString: "x" }, { constructor: 1 }]) {
    await neverServerError("POST", R, body);
  }
  await expects("POST", R, 400, []);
  await expects("POST", R, 400, { asistente_id: 2, tipo: "RECARGA", monto: 10_000, descripcion: { toString: () => "x" } });
});

test("a prototype in the body is not honoured and is not editable", async (t) => {
  t.after(purge);
  await create(2, "RECARGA", 10_000);
  const polluted = JSON.parse('{"__proto__": {"admin": true}, "descripcion": "Bar"}');
  await expects("PATCH", `${R}/1`, 400, polluted);
  assert.equal(({} as Record<string, unknown>).admin, undefined, "the prototype of Object is untouched");
});

test("a description is stored and read back byte for byte", async (t) => {
  t.after(purge);
  await create(2, "RECARGA", 50_000);
  const hostile = "日本語 🎉 ñ ' \" ; -- /* \\ %00 <script>";
  const { data } = await expects("POST", R, 201, { asistente_id: 2, tipo: "CONSUMO", monto: 1_000, descripcion: hostile });
  assert.equal(data.descripcion, hostile);
  const read = await expects("GET", `${R}/${data.id}`, 200);
  assert.equal(read.data.descripcion, hostile, "what was posted is what comes back");
  assert.equal(await saldo(2), 49_000);
});

test("a quote in a filter or a sort is not a statement", async (t) => {
  t.after(purge);
  for (const tipo of ["RECARGA'", "CONSUMO' OR '1'='1", "'; DROP TABLE movimientos; --", "RECHARGA\\"]) {
    await neverServerError("GET", `${R}?tipo=${encodeURIComponent(tipo)}`);
  }
  await expects("GET", `${R}?asistente_id=1%20OR%201=1`, 400);
  await expects("GET", `${R}?asistente_id=${encodeURIComponent("1;DROP TABLE movimientos")}`, 400);
  await expects("GET", `${R}?limit=10&order=${encodeURIComponent("id; DROP TABLE movimientos")}`, 200, undefined, "an unknown parameter is ignored");
});

test("the table is still there after every attempt", async (t) => {
  t.after(purge);
  const { pagination } = await expects("GET", `${R}?limit=1`, 200);
  assert.equal(typeof pagination.total, "number");
  assert.ok(pagination.total > 0, "the movements table still holds its rows");
});
