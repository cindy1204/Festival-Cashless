import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import { call, cleanup, create, purge, saldo } from "../helpers/db-api.js";

const R = "/api/movimientos";
const ATTENDEE = 2;

before(cleanup);
after(cleanup);

/** The balance added up from the listed movements, the way a reader would. */
const fromListing = async (attendeeId: number): Promise<number> => {
  const { body } = await call("GET", `${R}?asistente_id=${attendeeId}&limit=50`);
  const rows: { tipo: string; monto: number }[] = body.data;
  return rows.reduce((sum, row) => sum + (row.tipo === "RECARGA" ? row.monto : -row.monto), 0);
};

/**
 * Everything in this file is about two writers meeting on one row or one
 * wallet. The fake repository has no lock, so these properties can only be
 * checked here, against the database that actually has one.
 */
test("the balance never goes negative however many writers arrive", async (t) => {
  t.after(purge);
  await create(ATTENDEE, "RECARGA", 100_000);
  const responses = await Promise.all(Array.from({ length: 24 }, () => call("POST", R, { asistente_id: ATTENDEE, tipo: "CONSUMO", monto: 10_000 })));
  const accepted = responses.filter((r) => r.status === 201).length;
  assert.equal(accepted, 10, `only what the wallet could pay for is accepted, got ${JSON.stringify(responses.map((r) => r.status))}`);
  assert.equal(await saldo(ATTENDEE), 0);
  assert.equal(await fromListing(ATTENDEE), 0, "the balance agrees with the movements behind it");
});

test("a storm of cancels closes one row once and never the money twice", async (t) => {
  t.after(purge);
  await create(ATTENDEE, "RECARGA", 50_000);
  const row = await create(ATTENDEE, "CONSUMO", 20_000);
  const results = await Promise.all(Array.from({ length: 10 }, () => call("DELETE", `${R}/${row.id}`)));
  assert.equal(results.filter((r) => r.status === 200).length, 1, "one cancel answers 200");
  assert.equal(results.filter((r) => r.status === 404).length, 9, "the others find it already closed");
  assert.equal(await saldo(ATTENDEE), 50_000, "the amount came back exactly once");
  assert.equal(await fromListing(ATTENDEE), 50_000);
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
  const balance = await saldo(ATTENDEE);
  assert.equal(balance, await fromListing(ATTENDEE), "the projection and the movements agree");
  assert.ok(balance >= 0, "the wallet is never negative");
  assert.ok(balance === 20_000 || balance === 50_000, `both effects landed exactly once, got ${balance}`);
});

test("two wallets do not block or corrupt each other", async (t) => {
  t.after(purge);
  const before = await saldo(ATTENDEE);
  const otherBefore = await saldo(1);
  const [mine, theirs] = await Promise.all([
    Promise.all(Array.from({ length: 6 }, () => call("POST", R, { asistente_id: ATTENDEE, tipo: "RECARGA", monto: 10_000 }))),
    Promise.all(Array.from({ length: 6 }, () => call("POST", R, { asistente_id: 1, tipo: "RECARGA", monto: 10_000 }))),
  ]);
  assert.equal(mine.filter((r) => r.status === 201).length, 6);
  assert.equal(theirs.filter((r) => r.status === 201).length, 6);
  assert.equal(await saldo(ATTENDEE), before + 60_000);
  assert.equal(await saldo(1), otherBefore + 60_000);
});

test("the largest contract amount repeated many times stays an exact integer", async (t) => {
  t.after(purge);
  const max = 2_000_000;
  await Promise.all(Array.from({ length: 10 }, () => call("POST", R, { asistente_id: ATTENDEE, tipo: "RECARGA", monto: max })));
  assert.equal(await saldo(ATTENDEE), max * 10, "no rounding, no drift, no float error");
  assert.equal(await fromListing(ATTENDEE), max * 10);
});

test("a refused write leaves no trace at all", async (t) => {
  t.after(purge);
  await create(ATTENDEE, "RECARGA", 20_000);
  const { body: listed } = await call("GET", `${R}?asistente_id=${ATTENDEE}&limit=1`);
  const rows = listed.pagination.total as number;
  const balance = await saldo(ATTENDEE);
  await call("POST", R, { asistente_id: ATTENDEE, tipo: "CONSUMO", monto: 1_000_000 });
  await call("POST", R, { asistente_id: 999_999, tipo: "RECARGA", monto: 10_000 });
  await call("POST", R, { asistente_id: ATTENDEE, tipo: "RECARGA", monto: 1 });
  const { body: afterRefusals } = await call("GET", `${R}?asistente_id=${ATTENDEE}&limit=1`);
  assert.equal(afterRefusals.pagination.total, rows, "nothing was written by a refusal");
  assert.equal(await saldo(ATTENDEE), balance);
});
