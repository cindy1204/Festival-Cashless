import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { TAG, call, create, reset, saldo, wallet } from "../helpers/api.js";

const R = "/api/movimientos";
/** Empty in the fixture, so every balance here starts at zero. */
const ATTENDEE = 2;
/** Arrives with money, so only changes are compared. */
const OTHER = 1;

beforeEach(reset);
/** The balance added up from the listed movements, the way a reader would. */
const fromListing = async (attendeeId: number): Promise<number> => {
  const { body } = await call("GET", `${R}?asistente_id=${attendeeId}&limit=50`);
  const rows: { tipo: string; monto: number }[] = body.data;
  return rows.reduce((sum, row) => sum + (row.tipo === "RECARGA" ? row.monto : -row.monto), 0);
};

const countOf = async (attendeeId: number): Promise<number> => {
  const { body } = await call("GET", `${R}?asistente_id=${attendeeId}&limit=1`);
  return body.pagination.total as number;
};

test("two wallets do not block or corrupt each other", async () => {
  const otherBefore = await saldo(OTHER);
  const mineBefore = await saldo(ATTENDEE);
  const [mine, theirs] = await Promise.all([
    Promise.all(Array.from({ length: 6 }, () => call("POST", R, { asistente_id: ATTENDEE, tipo: "RECARGA", monto: 10_000 }))),
    Promise.all(Array.from({ length: 6 }, () => call("POST", R, { asistente_id: OTHER, tipo: "RECARGA", monto: 10_000 }))),
  ]);
  assert.equal(mine.filter((r) => r.status === 201).length, 6);
  assert.equal(theirs.filter((r) => r.status === 201).length, 6);
  assert.equal(await saldo(ATTENDEE), mineBefore + 60_000);
  assert.equal(await saldo(OTHER), otherBefore + 60_000, "the wallet that arrived with money kept it");
});

test("the largest contract amount repeated many times stays an exact integer", async () => {
  const max = 2_000_000;
  await Promise.all(Array.from({ length: 10 }, () => call("POST", R, { asistente_id: ATTENDEE, tipo: "RECARGA", monto: max })));
  assert.equal(await saldo(ATTENDEE), max * 10, "no rounding, no drift, no float error");
  assert.equal(await fromListing(ATTENDEE), max * 10);
});

test("a refused write leaves no trace at all", async () => {
  await create(ATTENDEE, "RECARGA", 20_000);
  const rows = await countOf(ATTENDEE);
  const balance = await saldo(ATTENDEE);
  await call("POST", R, { asistente_id: ATTENDEE, tipo: "CONSUMO", monto: 1_000_000 });
  await call("POST", R, { asistente_id: 999_999, tipo: "RECARGA", monto: 10_000 });
  await call("POST", R, { asistente_id: ATTENDEE, tipo: "RECARGA", monto: 1 });
  assert.equal(await countOf(ATTENDEE), rows, "nothing was written by a refusal");
  assert.equal(await saldo(ATTENDEE), balance);
});

test("a closed row is kept as history and stops counting", async () => {
  await create(ATTENDEE, "RECARGA", 30_000);
  const row = await create(ATTENDEE, "CONSUMO", 10_000, TAG);
  const before = await countOf(ATTENDEE);
  const { status } = await call("DELETE", `${R}/${row.id}`);
  assert.equal(status, 200);
  assert.equal((await call("GET", `${R}/${row.id}`)).status, 404, "a closed row is not an active row");
  assert.equal(await countOf(ATTENDEE), before - 1, "it left the list of active movements");
  assert.equal(await saldo(ATTENDEE), 30_000, "and the money came back");
});
