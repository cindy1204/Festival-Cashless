import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import { call, cleanup, create, purge, saldo, TAG } from "../helpers/api.js";
import { prisma } from "../../src/infrastructure/prisma/client.js";

const R = "/api/movimientos";
/** Empty in the fixture, so every balance here starts at zero. */
const ATTENDEE = 2;
/** Arrives with money, so only changes are compared. */
const OTHER = 1;

before(cleanup);
after(cleanup);

/** The balance recomputed from the rows, the way an auditor would. */
const fromRows = async (attendeeId: number): Promise<number> => {
  const result = await prisma().$queryRaw<{ saldo: bigint }[]>`
    SELECT COALESCE(SUM(monto) FILTER (WHERE tipo = 'RECARGA'), 0)
         - COALESCE(SUM(monto) FILTER (WHERE tipo = 'CONSUMO'), 0) AS saldo
    FROM movimientos WHERE asistente_id = ${attendeeId} AND state = 'ACTIVE'`;
  return Number(result[0]?.saldo ?? 0n);
};

test("the balance never goes negative however many writers arrive", async (t) => {
  t.after(purge);
  await create(ATTENDEE, "RECARGA", 100_000);
  const responses = await Promise.all(Array.from({ length: 24 }, () => call("POST", R, { asistente_id: ATTENDEE, tipo: "CONSUMO", monto: 10_000 })));
  const accepted = responses.filter((r) => r.status === 201).length;
  assert.equal(accepted, 10, `only what the wallet could pay for is accepted, got ${JSON.stringify(responses.map((r) => r.status))}`);
  assert.equal(await saldo(ATTENDEE), 0);
  assert.equal(await fromRows(ATTENDEE), 0);
});

test("a storm of cancels closes one row once and never the money twice", async (t) => {
  t.after(purge);
  await create(ATTENDEE, "RECARGA", 50_000);
  const row = await create(ATTENDEE, "CONSUMO", 20_000);
  const results = await Promise.all(Array.from({ length: 10 }, () => call("DELETE", `${R}/${row.id}`)));
  assert.equal(results.filter((r) => r.status === 200).length, 1, "one cancel answers 200");
  assert.equal(results.filter((r) => r.status === 404).length, 9, "the others find it already closed");
  assert.equal(await saldo(ATTENDEE), 50_000, "the amount came back exactly once");
  assert.equal(await fromRows(ATTENDEE), 50_000);
});

test("cancelling and spending the same row at once keeps the books equal", async (t) => {
  t.after(purge);
  await create(ATTENDEE, "RECARGA", 80_000);
  const row = await create(ATTENDEE, "CONSUMO", 30_000);
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      i % 2 === 0 ? call("DELETE", `${R}/${row.id}`) : call("POST", R, { asistente_id: ATTENDEE, tipo: "CONSUMO", monto: 30_000 })),
  );
  assert.ok(results.some((r) => r.status === 200 || r.status === 201));
  assert.equal(await saldo(ATTENDEE), await fromRows(ATTENDEE), "the projection and the rows agree");
  assert.ok((await saldo(ATTENDEE)) >= 0, "the wallet is never negative");
});

test("two wallets do not block or corrupt each other", async (t) => {
  t.after(purge);
  const otherBefore = await fromRows(OTHER);
  const [mine, theirs] = await Promise.all([
    Promise.all(Array.from({ length: 6 }, () => call("POST", R, { asistente_id: ATTENDEE, tipo: "RECARGA", monto: 10_000 }))),
    Promise.all(Array.from({ length: 6 }, () => call("POST", R, { asistente_id: OTHER, tipo: "RECARGA", monto: 10_000 }))),
  ]);
  assert.equal(mine.filter((r) => r.status === 201).length, 6);
  assert.equal(theirs.filter((r) => r.status === 201).length, 6);
  assert.equal(await fromRows(ATTENDEE), 60_000);
  assert.equal(await fromRows(OTHER), otherBefore + 60_000, "the preloaded rows are still under the change");
});

test("the largest contract amount repeated many times stays an exact integer", async (t) => {
  t.after(purge);
  const max = 2_000_000;
  await Promise.all(Array.from({ length: 10 }, () => call("POST", R, { asistente_id: ATTENDEE, tipo: "RECARGA", monto: max })));
  assert.equal(await saldo(ATTENDEE), max * 10, "no rounding, no drift, no float error");
  assert.equal(await fromRows(ATTENDEE), max * 10);
});

test("a refused write leaves no trace at all", async (t) => {
  t.after(purge);
  const before = await prisma().movimientos.count();
  await call("POST", R, { asistente_id: ATTENDEE, tipo: "CONSUMO", monto: 1_000 });
  await call("POST", R, { asistente_id: 999_999, tipo: "RECARGA", monto: 10_000 });
  await call("POST", R, { asistente_id: ATTENDEE, tipo: "RECARGA", monto: 1 });
  assert.equal(await prisma().movimientos.count(), before, "nothing was written by a refusal");
});

test("a closed row is kept as history and stops counting", async (t) => {
  t.after(purge);
  await create(ATTENDEE, "RECARGA", 30_000);
  const row = await create(ATTENDEE, "CONSUMO", 10_000, TAG);
  await call("DELETE", `${R}/${row.id}`);
  const stored = await prisma().movimientos.findUnique({ where: { id: row.id } });
  assert.equal(stored?.state, "REMOVED", "the row is a record, not a deletion");
  assert.equal(await saldo(ATTENDEE), 30_000);
});
