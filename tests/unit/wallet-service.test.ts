import { test } from "node:test";
import assert from "node:assert/strict";

import { WalletService } from "../../src/application/wallet-service.js";
import { codeOf, FakeWalletRepository } from "../helpers/fake-wallet-repository.js";

const serviceWith = (setup?: (repo: FakeWalletRepository) => void) => {
  const repo = new FakeWalletRepository();
  setup?.(repo);
  return { repo, service: new WalletService(repo) };
};

test("a recharge is created and the balance grows", async () => {
  const { repo, service } = serviceWith();
  const created = await service.create({ asistente_id: 2, tipo: "RECARGA", monto: 50_000 });
  assert.equal(created.tipo, "RECARGA");
  assert.equal(repo.rows.get(created.id)?.state, "ACTIVE");
  assert.deepEqual(await service.balance(2), { asistente_id: 2, saldo: 50_000 });
});

test("a consumption is refused when the balance would go negative", async () => {
  const { service } = serviceWith((repo) => repo.seed(2, "RECARGA", 10_000));
  assert.equal(await codeOf(() => service.create({ asistente_id: 2, tipo: "CONSUMO", monto: 10_001 })), "CONFLICT");
  await service.create({ asistente_id: 2, tipo: "CONSUMO", monto: 10_000 });
});

test("validation wins over a missing attendee", async () => {
  const { service } = serviceWith();
  assert.equal(await codeOf(() => service.create({ asistente_id: 999, tipo: "RECARGA", monto: 1 })), "VALIDATION");
  assert.equal(await codeOf(() => service.create({ asistente_id: 999, tipo: "RECARGA", monto: 50_000 })), "NOT_FOUND");
});

test("every write takes the attendee lock exactly once", async () => {
  const { repo, service } = serviceWith();
  await service.create({ asistente_id: 2, tipo: "RECARGA", monto: 50_000 });
  await service.create({ asistente_id: 2, tipo: "CONSUMO", monto: 1_000 });
  const created = repo.seed(2, "RECARGA", 1_000);
  await service.cancel(created.id);
  assert.equal(repo.locks, 3);
});

test("cancelling a consumption restores the amount", async () => {
  const { service } = serviceWith((repo) => {
    repo.seed(2, "RECARGA", 50_000);
    repo.seed(2, "CONSUMO", 20_000);
  });
  const consumo = await service.create({ asistente_id: 2, tipo: "CONSUMO", monto: 30_000 });
  assert.equal((await service.balance(2)).saldo, 0);
  const cancelled = await service.cancel(consumo.id);
  assert.equal(cancelled.state, "REMOVED");
  assert.equal((await service.balance(2)).saldo, 30_000);
});

test("cancelling a recharge is refused while the balance depends on it", async () => {
  const repo = new FakeWalletRepository();
  const recharge = repo.seed(2, "RECARGA", 50_000);
  repo.seed(2, "CONSUMO", 50_000);
  const service = new WalletService(repo);
  assert.equal(await codeOf(() => service.cancel(recharge.id)), "CONFLICT");
  assert.equal(repo.rows.get(recharge.id)?.state, "ACTIVE");
});

test("cancelling twice is a not found", async () => {
  const repo = new FakeWalletRepository();
  repo.seed(2, "RECARGA", 50_000);
  const service = new WalletService(repo);
  const row = repo.seed(2, "CONSUMO", 1_000);
  await service.cancel(row.id);
  assert.equal(await codeOf(() => service.cancel(row.id)), "NOT_FOUND");
  assert.equal(await codeOf(() => service.get(row.id)), "NOT_FOUND");
});

test("patch only accepts descripcion and never changes the balance", async () => {
  const repo = new FakeWalletRepository();
  repo.seed(2, "RECARGA", 50_000);
  const service = new WalletService(repo);
  const row = repo.seed(2, "CONSUMO", 1_000);
  assert.equal(await codeOf(() => service.updateDescription(row.id, { monto: 1 })), "VALIDATION");
  assert.equal(await codeOf(() => service.updateDescription(row.id, { tipo: "RECARGA" })), "VALIDATION");
  assert.equal(await codeOf(() => service.updateDescription(row.id, {})), "VALIDATION");
  assert.equal(await codeOf(() => service.updateDescription(row.id, { descripcion: "a".repeat(201) })), "VALIDATION");
  const before = await service.balance(2);
  const updated = await service.updateDescription(row.id, { descripcion: "Bar" });
  assert.equal(updated.descripcion, "Bar");
  assert.deepEqual(await service.balance(2), before);
});

test("the balance endpoint answers 404 for an unknown attendee", async () => {
  const { service } = serviceWith();
  assert.equal(await codeOf(() => service.balance(999)), "NOT_FOUND");
  assert.equal(await codeOf(() => service.get(999)), "NOT_FOUND");
  assert.equal(await codeOf(() => service.get("abc")), "VALIDATION");
});

test("lists are paginated, filtered and ordered by id", async () => {
  const repo = new FakeWalletRepository();
  repo.seed(1, "RECARGA", 100_000);
  repo.seed(2, "RECARGA", 50_000);
  repo.seed(2, "CONSUMO", 20_000);
  const service = new WalletService(repo);
  const page = await service.list({ page: { limit: 2, offset: 0 } });
  assert.equal(page.total, 3);
  assert.deepEqual(page.rows.map((row) => row.id), [...page.rows.map((row) => row.id)].sort((a, b) => a - b));
  const filtered = await service.list({ page: { limit: 10, offset: 0 }, attendeeId: 2 });
  assert.equal(filtered.total, 2);
  const byType = await service.list({ page: { limit: 10, offset: 0 }, type: "CONSUMO" });
  assert.equal(byType.total, 1);
});
