import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import { call, cleanup, create, purge, saldo, TAG } from "../helpers/api.js";

const R = "/api/movimientos";
const PARALLEL = 8;

before(cleanup);
after(cleanup);

const post = (body: unknown) => call("POST", R, body).then((response) => response.status);

/**
 * The lock is the only thing that makes a balance safe, so it is tested with
 * requests that really overlap instead of with a single writer in a row.
 */
test("parallel recharges for one attendee are all applied", async (t) => {
  t.after(purge);
  const statuses = await Promise.all(
    Array.from({ length: PARALLEL }, () => post({ asistente_id: 2, tipo: "RECARGA", monto: 10_000, descripcion: TAG })),
  );
  assert.deepEqual(statuses, Array(PARALLEL).fill(201));
  assert.equal(await saldo(2), PARALLEL * 10_000);
});

test("parallel consumptions cannot overdraw the wallet", async (t) => {
  t.after(purge);
  await create(2, "RECARGA", 20_000);
  const statuses = await Promise.all(
    Array.from({ length: PARALLEL }, () => post({ asistente_id: 2, tipo: "CONSUMO", monto: 10_000 })),
  );
  const created = statuses.filter((status) => status === 201).length;
  assert.equal(created, 2, `only two consumptions fit in 20000, got ${JSON.stringify(statuses)}`);
  assert.equal(statuses.length - created, PARALLEL - 2);
  assert.equal(await saldo(2), 0);
});

test("a parallel cancel and spend of the same movement keeps the balance consistent", async (t) => {
  t.after(purge);
  await create(2, "RECARGA", 30_000);
  const consumo = await create(2, "CONSUMO", 10_000);

  const [cancel, spend] = await Promise.all([
    call("DELETE", `${R}/${consumo.id}`),
    post({ asistente_id: 2, tipo: "CONSUMO", monto: 10_000 }),
  ]);
  assert.equal(cancel.status, 200);
  assert.equal(spend, 201);
  // The lock orders the two writers but does not choose which one goes first,
  // so both serial outcomes are valid. What cannot happen is a lost or
  // duplicated effect, which would land outside this set.
  const balance = await saldo(2);
  assert.ok(balance === 10_000 || balance === 20_000, `both effects were applied exactly once, got ${balance}`);
});
