import { test } from "node:test";
import assert from "node:assert/strict";

import { WalletService } from "../../src/application/wallet-service.js";
import { FakeWalletRepository } from "../helpers/fake-wallet-repository.js";

const ATTENDEE = 1;

/**
 * The rows are the truth and the balance is a number derived from them, so
 * every test here ends by adding the rows up itself. If the service kept a
 * figure of its own, these would disagree with the ledger.
 */
const audited = (repo: FakeWalletRepository, attendeeId = ATTENDEE): number =>
  [...repo.rows.values()]
    .filter((row) => row.state === "ACTIVE" && row.asistente_id === attendeeId)
    .reduce((sum, row) => sum + (row.tipo === "RECARGA" ? row.monto : -row.monto), 0);

const service = (repo: FakeWalletRepository): WalletService => new WalletService(repo);

test("a mixed day leaves the balance equal to the sum of its rows", async () => {
  const repo = new FakeWalletRepository();
  const wallet = service(repo);
  await wallet.create({ asistente_id: ATTENDEE, tipo: "RECARGA", monto: 100_000 });
  await wallet.create({ asistente_id: ATTENDEE, tipo: "CONSUMO", monto: 30_000 });
  await wallet.create({ asistente_id: ATTENDEE, tipo: "CONSUMO", monto: 20_000 });
  const closing = await wallet.create({ asistente_id: ATTENDEE, tipo: "CONSUMO", monto: 10_000 });
  await wallet.cancel(closing.id);
  assert.equal((await wallet.balance(ATTENDEE)).saldo, 50_000);
  assert.equal((await wallet.balance(ATTENDEE)).saldo, audited(repo), "the projection is the sum of the rows");
});

test("a row is only ever created, closed and never created twice", async () => {
  const repo = new FakeWalletRepository();
  const wallet = service(repo);
  await wallet.create({ asistente_id: ATTENDEE, tipo: "RECARGA", monto: 50_000 });
  const spend = await wallet.create({ asistente_id: ATTENDEE, tipo: "CONSUMO", monto: 20_000 });
  await wallet.cancel(spend.id);
  const rows = [...repo.rows.values()];
  assert.equal(rows.length, 2, "a cancel is a state, not a new row and not a deletion");
  assert.deepEqual(rows.map((row) => row.state).sort(), ["ACTIVE", "REMOVED"]);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, "ids are unique");
});

test("closing the same row again changes nothing and is refused", async () => {
  const repo = new FakeWalletRepository();
  const wallet = service(repo);
  await wallet.create({ asistente_id: ATTENDEE, tipo: "RECARGA", monto: 50_000 });
  const spend = await wallet.create({ asistente_id: ATTENDEE, tipo: "CONSUMO", monto: 20_000 });
  await wallet.cancel(spend.id);
  const { saldo: balance } = await wallet.balance(ATTENDEE);
  await assert.rejects(() => wallet.cancel(spend.id));
  assert.equal((await wallet.balance(ATTENDEE)).saldo, balance, "the money was not returned a second time");
  assert.equal(audited(repo), balance);
});

test("a wallet cannot be spent past what the rows say it holds", async () => {
  const repo = new FakeWalletRepository();
  const wallet = service(repo);
  await wallet.create({ asistente_id: ATTENDEE, tipo: "RECARGA", monto: 100_000 });
  for (let i = 0; i < 9; i++) {
    await wallet.create({ asistente_id: ATTENDEE, tipo: "CONSUMO", monto: 10_000 });
  }
  assert.equal((await wallet.balance(ATTENDEE)).saldo, 10_000);
  await assert.rejects(() => wallet.create({ asistente_id: ATTENDEE, tipo: "CONSUMO", monto: 10_001 }));
  assert.equal((await wallet.balance(ATTENDEE)).saldo, 10_000, "the refused spend left no row behind");
  assert.equal(audited(repo), 10_000);
});

test("each wallet is audited on its own rows", async () => {
  const repo = new FakeWalletRepository();
  const wallet = service(repo);
  await wallet.create({ asistente_id: 1, tipo: "RECARGA", monto: 10_000 });
  await wallet.create({ asistente_id: 2, tipo: "RECARGA", monto: 20_000 });
  await wallet.create({ asistente_id: 2, tipo: "CONSUMO", monto: 5_000 });
  for (const attendee of [1, 2, 3]) {
    assert.equal((await wallet.balance(attendee)).saldo, audited(repo, attendee), `wallet ${attendee} matches its own rows`);
  }
  assert.equal((await wallet.balance(3)).saldo, 0, "a wallet nobody touched is zero, not absent");
});

test("the largest amounts add up without losing a peso", async () => {
  const repo = new FakeWalletRepository();
  const wallet = service(repo);
  const max = 2_000_000;
  for (let i = 0; i < 10; i++) {
    await wallet.create({ asistente_id: ATTENDEE, tipo: "RECARGA", monto: max });
  }
  assert.equal((await wallet.balance(ATTENDEE)).saldo, max * 10);
  assert.equal(audited(repo), max * 10);
});
