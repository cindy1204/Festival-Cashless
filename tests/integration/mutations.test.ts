import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import { call, cleanup, create, purge, saldo, TAG } from "../helpers/api.js";

const R = "/api/movimientos";

before(cleanup);
after(cleanup);

/** Every test starts with a clean wallet and removes the rows it created. */
const scenario = async (t: { after: (fn: () => unknown) => void }): Promise<void> => {
  t.after(purge);
  assert.equal(await saldo(2), 0, "the attendee starts the test with no movements");
};

const status = async (method: string, path: string, expected: number, body?: unknown) => {
  const response = await call(method, path, body);
  assert.equal(response.status, expected, `${method} ${path} -> ${JSON.stringify(response.body)}`);
  return response.body;
};

const post = (body: unknown, expected: number) => status("POST", R, expected, body);

test("a create answers 201 with the stored row", async (t) => {
  await scenario(t);
  const { data } = await post({ asistente_id: 2, tipo: "RECARGA", monto: 50_000, descripcion: TAG }, 201);
  assert.deepEqual(Object.keys(data).sort(), ["asistente_id", "descripcion", "id", "monto", "state", "tipo"]);
  assert.equal(data.tipo, "RECARGA");
  assert.equal(data.state, "ACTIVE");
  assert.equal(typeof data.id, "number");
});

test("server side fields in the body are ignored", async (t) => {
  await scenario(t);
  await create(2, "RECARGA", 10_000);
  const { data } = await post({ asistente_id: 2, tipo: "CONSUMO", monto: 1_000, state: "REMOVED", id: 424_242 }, 201);
  assert.equal(data.state, "ACTIVE");
  assert.notEqual(data.id, 424_242);
});

test("a recharge moves the balance and a consumption takes it back", async (t) => {
  await scenario(t);
  const recharge = await create(2, "RECARGA", 50_000);
  assert.equal(await saldo(2), 50_000);
  const consumo = await create(2, "CONSUMO", 20_000);
  assert.equal(await saldo(2), 30_000);
  await status("DELETE", `${R}/${consumo.id}`, 200);
  assert.equal(await saldo(2), 50_000);
  await status("DELETE", `${R}/${recharge.id}`, 200);
  assert.equal(await saldo(2), 0);
});

test("recharge bounds are inclusive and checked just outside", async (t) => {
  await scenario(t);
  await post({ asistente_id: 2, tipo: "RECARGA", monto: 9_999 }, 400);
  await post({ asistente_id: 2, tipo: "RECARGA", monto: 2_000_001 }, 400);
  await post({ asistente_id: 2, tipo: "RECARGA", monto: 10_000, descripcion: TAG }, 201);
  await post({ asistente_id: 2, tipo: "RECARGA", monto: 2_000_000, descripcion: TAG }, 201);
});

test("a consumption of any positive amount is allowed", async (t) => {
  await scenario(t);
  await create(2, "RECARGA", 10_000);
  await post({ asistente_id: 2, tipo: "CONSUMO", monto: 1, descripcion: TAG }, 201);
  assert.equal(await saldo(2), 9_999);
});

test("the body must be complete and correctly typed", async (t) => {
  await scenario(t);
  await post(undefined, 400);
  await post({}, 400);
  await post({ tipo: "RECARGA", monto: 50_000 }, 400);
  await post({ asistente_id: "2", tipo: "RECARGA", monto: 50_000 }, 400);
  await post({ asistente_id: 2, tipo: "RECARGA", monto: "50000" }, 400);
  await post({ asistente_id: 2, tipo: "OTRO", monto: 50_000 }, 400);
  await post({ asistente_id: 2, tipo: "CONSUMO", monto: 0 }, 400);
  await post({ asistente_id: 2, tipo: "CONSUMO", monto: 1, descripcion: "a".repeat(201) }, 400);
});

test("a shape error wins over a missing attendee", async (t) => {
  await scenario(t);
  await post({ asistente_id: 999, tipo: "RECARGA", monto: 1 }, 400);
  await post({ asistente_id: 999, tipo: "RECARGA", monto: 50_000 }, 404);
});

test("a consumption that empties the balance is accepted, one peso more is a conflict", async (t) => {
  await scenario(t);
  const recharge = await create(2, "RECARGA", 20_000);
  const consumo = await create(2, "CONSUMO", 20_000);
  assert.equal(await saldo(2), 0);
  await post({ asistente_id: 2, tipo: "CONSUMO", monto: 1 }, 409);
  assert.equal(await saldo(2), 0, "the rejected consumption changed nothing");
  await status("DELETE", `${R}/${consumo.id}`, 200);
  await status("DELETE", `${R}/${recharge.id}`, 200);
});

test("a recharge cannot be canceled while the balance depends on it", async (t) => {
  await scenario(t);
  const recharge = await create(2, "RECARGA", 50_000);
  const consumo = await create(2, "CONSUMO", 50_000);
  assert.equal(await saldo(2), 0);

  await status("DELETE", `${R}/${recharge.id}`, 409);
  assert.equal((await status("GET", `${R}/${recharge.id}`, 200)).data.state, "ACTIVE", "the rejected row stays active");
  assert.equal(await saldo(2), 0, "the rejected cancel changed nothing");

  await status("DELETE", `${R}/${consumo.id}`, 200);
  await status("DELETE", `${R}/${recharge.id}`, 200);
  assert.equal(await saldo(2), 0);
});

test("canceling is logical and idempotently 404 on the second call", async (t) => {
  await scenario(t);
  await create(2, "RECARGA", 10_000);
  const row = await create(2, "CONSUMO", 1_000);
  await status("DELETE", `${R}/${row.id}`, 200);
  await status("DELETE", `${R}/${row.id}`, 404);
  await status("GET", `${R}/${row.id}`, 404);
  await status("PATCH", `${R}/${row.id}`, 404, { descripcion: "x" });
});

test("patch accepts only descripcion and never changes the balance", async (t) => {
  await scenario(t);
  await create(2, "RECARGA", 30_000);
  const consumo = await create(2, "CONSUMO", 10_000);
  const before = await saldo(2);

  await status("PATCH", `${R}/${consumo.id}`, 400, { monto: 1 });
  await status("PATCH", `${R}/${consumo.id}`, 400, { tipo: "RECARGA" });
  await status("PATCH", `${R}/${consumo.id}`, 400, { asistente_id: 3 });
  await status("PATCH", `${R}/${consumo.id}`, 400, {});
  await status("PATCH", `${R}/${consumo.id}`, 400, { descripcion: null });
  await status("PATCH", `${R}/${consumo.id}`, 400, { descripcion: "a".repeat(201) });

  const { data } = await status("PATCH", `${R}/${consumo.id}`, 200, { descripcion: "Bar" });
  assert.equal(data.descripcion, "Bar");
  assert.equal(data.monto, consumo.monto, "only the description changes");
  assert.equal(await saldo(2), before);
});
