import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import { call, cleanup, create, purge, saldo } from "../helpers/api.js";

const GET = "/api/movimientos";

before(cleanup);
after(cleanup);

const error = async (method: string, path: string, expected = 400, body?: unknown) => {
  const response = await call(method, path, body);
  assert.equal(response.status, expected, `${method} ${path} -> ${JSON.stringify(response.body)}`);
  assert.equal(typeof response.body?.error, "string");
  assert.ok(response.body.error.length > 0, "the envelope must carry a message");
};

test("an invalid page or limit is rejected", async (t) => {
  t.after(purge);
  await error("GET", `${GET}?limit=0`);
  await error("GET", `${GET}?limit=51`);
  await error("GET", `${GET}?page=-1`);
  await error("GET", `${GET}?page=0`);
  await error("GET", `${GET}?limit=abc`);
});

test("pagination defaults to page 1 and limit 10", async (t) => {
  t.after(purge);
  const { status, body } = await call("GET", GET);
  assert.equal(status, 200);
  assert.equal(body.pagination.currentPage, 1);
  assert.equal(body.pagination.limit, 10);
  assert.equal(body.pagination.totalPages, Math.ceil(body.pagination.total / 10));
});

test("the page and the total share the same predicate", async (t) => {
  t.after(purge);
  const query = `${GET}?limit=50&asistente_id=2`;
  const before = (await call("GET", query)).body.pagination.total;
  const recharge = await create(2, "RECARGA", 50_000);

  const filtered = (await call("GET", query)).body;
  assert.equal(filtered.pagination.total, before + 1);
  assert.equal(filtered.data.length, filtered.pagination.total, "the count and the page share the predicate");
  assert.ok(filtered.data.every((row: any) => row.asistente_id === 2));

  await call("DELETE", `${GET}/${recharge.id}`);
  assert.equal((await call("GET", query)).body.pagination.total, before);
});

test("an invalid numeric filter is rejected", async (t) => {
  t.after(purge);
  await error("GET", `${GET}?asistente_id=abc`);
  await error("GET", `${GET}?tipo=TRANSFERENCIA`);
});

test("a numeric filter keeps only that attendee", async (t) => {
  t.after(purge);
  const { body } = await call("GET", `${GET}?asistente_id=1&limit=50`);
  assert.ok(body.data.length >= 2);
  assert.ok(body.data.every((row: any) => row.asistente_id === 1));
});

test("a type filter keeps only that movement type", async (t) => {
  t.after(purge);
  const { body } = await call("GET", `${GET}?tipo=CONSUMO&limit=50`);
  assert.ok(body.data.every((row: any) => row.tipo === "CONSUMO"));
});

test("lists are ordered by id and exclude removed rows", async (t) => {
  t.after(purge);
  const first = await create(2, "RECARGA", 50_000);
  const second = await create(2, "CONSUMO", 1_000);
  assert.equal((await call("DELETE", `${GET}/${second.id}`)).status, 200);

  const { body } = await call("GET", `${GET}?asistente_id=2&limit=50`);
  const ids = body.data.map((row: any) => row.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
  assert.ok(!ids.includes(second.id), "a removed movement must not be listed");
  assert.ok(ids.includes(first.id));
  await call("DELETE", `${GET}/${first.id}`);
});

test("ids are validated before existence is checked", async (t) => {
  t.after(purge);
  await error("GET", `${GET}/abc`);
  await error("GET", `${GET}/0`);
  await error("GET", `${GET}/-3`);
  await error("PATCH", `${GET}/abc`, 400, { descripcion: "x" });
  await error("DELETE", `${GET}/abc`);
});

test("a missing movement is 404 in every route by id", async (t) => {
  t.after(purge);
  await error("GET", `${GET}/999999`, 404);
  await error("PATCH", `${GET}/999999`, 404, { descripcion: "x" });
  await error("DELETE", `${GET}/999999`, 404);
});

test("the balance answers for a known attendee and 404 otherwise", async (t) => {
  t.after(purge);
  const { status, body } = await call("GET", "/api/billeteras/1/saldo");
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(body.data).sort(), ["asistente_id", "saldo"]);
  assert.equal(body.data.asistente_id, 1);
  assert.equal(body.data.saldo, 150_000);
  await error("GET", "/api/billeteras/999/saldo", 404);
  await error("GET", "/api/billeteras/abc/saldo");
});

test("an unknown route answers 404 with the error envelope", async (t) => {
  t.after(purge);
  await error("GET", "/api/no-existe", 404);
});

test("the preloaded balance of the attendee is untouched by the suite", async (t) => {
  t.after(purge);
  assert.equal(await saldo(1), 150_000);
});
