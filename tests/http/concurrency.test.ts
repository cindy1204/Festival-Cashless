import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { call, create, reset, saldo, wallet } from "../helpers/api.js";

const R = "/api/movimientos";
/** Empty in the fixture, so every balance here starts at zero. */
const ATTENDEE = 2;
const OTHER = 3;

beforeEach(reset);

/** Waits for a condition, because proving two things overlap needs to see them overlap. */
const until = async (condition: () => boolean, what: string): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`timed out waiting for ${what}`);
};

const spend = (asistente_id: number) => call("POST", R, { asistente_id, tipo: "CONSUMO", monto: 10_000 });
const recharge = (asistente_id: number, monto = 10_000) => call("POST", R, { asistente_id, tipo: "RECARGA", monto });
const accepted = (results: { status: number }[]): number => results.filter((r) => r.status === 201).length;

/**
 * Every test here runs requests that are genuinely in flight together: they are
 * held outside the lock, the test waits until all of them have arrived, and only
 * then lets them in. Nothing depends on the microtask order happening to be safe.
 */
test("requests really do overlap, and the critical sections never do", async () => {
  wallet.hold();
  const inflight = [spend(ATTENDEE), spend(ATTENDEE), spend(ATTENDEE), spend(ATTENDEE)];
  await until(() => wallet.queued === 4, "four writers to be held outside the lock");
  wallet.release();
  await Promise.all(inflight);

  assert.equal(wallet.peakQueued, 4, "the four requests were in flight at the same moment");
  assert.equal(wallet.peak, 1, "and the lock still let one at a time through");
  assert.equal(wallet.locks, 4, "every writer went through the lock");
});

test("the balance never goes negative however many writers arrive", async () => {
  await create(ATTENDEE, "RECARGA", 100_000);
  wallet.hold();
  const inflight = Array.from({ length: 24 }, () => spend(ATTENDEE));
  await until(() => wallet.queued === 24, "every writer to arrive");
  wallet.release();
  const results = await Promise.all(inflight);

  assert.equal(accepted(results), 10, `only what the wallet could pay for is accepted, got ${JSON.stringify(results.map((r) => r.status))}`);
  assert.equal(await saldo(ATTENDEE), 0);
  assert.equal(wallet.peak, 1, "no two writers were inside the lock together");
});

test("a storm of cancels closes one row once and never the money twice", async () => {
  await create(ATTENDEE, "RECARGA", 50_000);
  const row = await create(ATTENDEE, "CONSUMO", 20_000);
  wallet.hold();
  const inflight = Array.from({ length: 10 }, () => call("DELETE", `${R}/${row.id}`));
  await until(() => wallet.queued === 10, "every cancel to arrive");
  wallet.release();
  const results = await Promise.all(inflight);

  assert.equal(results.filter((r) => r.status === 200).length, 1, "one cancel answers 200");
  assert.equal(results.filter((r) => r.status === 404).length, 9, "the others find it already closed");
  assert.equal(await saldo(ATTENDEE), 50_000, "the amount came back exactly once");
});

test("cancelling and spending the same row at once lands both effects once", async () => {
  await create(ATTENDEE, "RECARGA", 80_000);
  const row = await create(ATTENDEE, "CONSUMO", 30_000);
  wallet.hold();
  const inflight = Array.from({ length: 8 }, (_, i) => (i % 2 === 0 ? call("DELETE", `${R}/${row.id}`) : spend(ATTENDEE)));
  await until(() => wallet.queued === 8, "every writer to arrive");
  wallet.release();
  const results = await Promise.all(inflight);

  // Four spends of 10000 and one refund of 30000 come off a balance of 50000.
  // The order the lock picks cannot change the total, so this number is the same
  // whichever writer went first: if the refund is not applied exactly once, or a
  // spend is lost, the balance lands somewhere else.
  assert.equal(await saldo(ATTENDEE), 40_000);
  assert.equal(accepted(results), 4, "every spend was paid for");
  assert.equal(results.filter((r) => r.status === 200).length, 1, "one cancel answers 200");
  assert.equal(results.filter((r) => r.status === 404).length, 3, "the other three find it closed");
  assert.equal(wallet.peak, 1, "no two writers were inside the lock together");
});

test("two wallets do not block each other", async () => {
  await create(ATTENDEE, "RECARGA", 10_000);
  wallet.hold();
  const mine = [recharge(ATTENDEE), recharge(ATTENDEE), recharge(ATTENDEE)];
  const theirs = [recharge(OTHER), recharge(OTHER), recharge(OTHER)];
  await until(() => wallet.queued === 6, "every writer to arrive");
  wallet.release();
  const [mineResults, theirResults] = await Promise.all([Promise.all(mine), Promise.all(theirs)]);

  assert.equal(accepted(mineResults), 3);
  assert.equal(accepted(theirResults), 3);
  assert.equal(await saldo(ATTENDEE), 40_000);
  assert.equal(await saldo(OTHER), 30_000, "the other wallet was not held back by the first");
});

test("a read is answered while a writer is still held", async () => {
  await create(ATTENDEE, "RECARGA", 20_000);
  wallet.hold();
  const writer = recharge(ATTENDEE);

  // The writer is parked outside the lock and has written nothing. A read that
  // needed the lock would never answer while it is held, so the answer below is
  // the proof that reads do not queue behind the writers.
  await until(() => wallet.queued === 1, "the writer to be held");
  const reader = await call("GET", "/api/billeteras/2/saldo");
  assert.equal(reader.status, 200);
  assert.equal(reader.body.data.saldo, 20_000, "the held writer had not been applied yet");

  wallet.release();
  assert.equal((await writer).status, 201);
  assert.equal(await saldo(ATTENDEE), 30_000, "and the write still landed");
});


test("the largest contract amount repeated many times stays an exact integer", async () => {
  wallet.hold();
  const inflight = Array.from({ length: 10 }, () => recharge(ATTENDEE, 2_000_000));
  await until(() => wallet.queued === 10, "every writer to arrive");
  wallet.release();
  await Promise.all(inflight);
  assert.equal(await saldo(ATTENDEE), 20_000_000, "no rounding, no drift, no float error");
});
