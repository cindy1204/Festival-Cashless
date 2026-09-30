import { test } from "node:test";
import assert from "node:assert/strict";

import { PrismaWalletRepository } from "../../src/infrastructure/prisma/wallet-repository.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { Posting } from "../../src/domain/ledger.js";
import type { LockedWallet } from "../../src/application/ports/wallet-repository.js";

/**
 * The rest of the suite drives the service through a fake, so nothing in it can
 * say what the repository asks Prisma for. These tests answer exactly that.
 *
 * The client is stubbed and every call is recorded, so a change that would read
 * the wrong rows, take the lock outside the transaction, interpolate a value
 * into sql or write to another team's table fails here, without a database and
 * without a wallet. What a stub cannot do is prove the queries run: that stays
 * in `npm run test:db`.
 */

interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

interface Harness {
  readonly repo: PrismaWalletRepository;
  readonly log: Call[];
  readonly callsTo: (name: string) => Call[];
  readonly lastCallTo: (name: string) => Call;
}

type Results = Record<string, unknown>;

const ROW = { id: 1, asistente_id: 2, tipo: "RECARGA", monto: 50_000, descripcion: null, state: "ACTIVE" };

/** The projection the contract publishes: six columns, nothing else. */
const CONTRACT_COLUMNS = ["asistente_id", "descripcion", "id", "monto", "state", "tipo"];

/**
 * A tagged template reaches the driver as its literal chunks and its bound
 * values, so a query can be read the way postgres will receive it.
 */
const raw = (strings: TemplateStringsArray, ...values: unknown[]): { text: string; values: unknown[] } => ({
  text: strings.join("?"),
  values,
});

const harness = (results: Results = {}): Harness => {
  const log: Call[] = [];
  const answer = (name: string, fallback: unknown) => (...args: unknown[]) => {
    log.push({ name, args });
    return Promise.resolve(name in results ? results[name] : fallback);
  };
  const delegate = (scope: string, model: string) => ({
    findUnique: answer(`${scope}.${model}.findUnique`, null),
    findFirst: answer(`${scope}.${model}.findFirst`, null),
    findMany: answer(`${scope}.${model}.findMany`, []),
    count: answer(`${scope}.${model}.count`, 0),
    create: answer(`${scope}.${model}.create`, null),
    updateManyAndReturn: answer(`${scope}.${model}.updateManyAndReturn`, []),
  });
  const rawMethods = (scope: string) => ({
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = raw(strings, ...values);
      log.push({ name: `${scope}.$queryRaw`, args: [query.text, query.values] });
      return Promise.resolve(results.$queryRaw ?? []);
    },
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = raw(strings, ...values);
      log.push({ name: `${scope}.$executeRaw`, args: [query.text, query.values] });
      return Promise.resolve(0);
    },
  });

  const tx = { asistentes: delegate("tx", "asistentes"), movimientos: delegate("tx", "movimientos"), ...rawMethods("tx") };
  const db = {
    asistentes: delegate("db", "asistentes"),
    movimientos: delegate("db", "movimientos"),
    ...rawMethods("db"),
    $transaction: (...args: unknown[]) => {
      log.push({ name: "db.$transaction", args: args.slice(1) });
      const [fn] = args as [(client: unknown) => Promise<unknown>];
      return fn(tx);
    },
  };

  return {
    repo: new PrismaWalletRepository(db as unknown as PrismaClient),
    log,
    callsTo: (name) => log.filter((call) => call.name === name),
    lastCallTo: (name) => {
      const [found] = log.filter((call) => call.name === name).slice(-1);
      assert.ok(found, `expected a call to ${name}, got ${JSON.stringify(log.map((c) => c.name))}`);
      return found;
    },
  };
};

const posting = (over: Partial<Posting> = {}): Posting => ({
  direction: "credit",
  amount: 50_000,
  attendeeId: 2,
  type: "RECARGA",
  balanceBefore: 0,
  balanceAfter: 50_000,
  reverses: null,
  ...over,
});

/** Runs the callback on a wallet that is already holding the lock. */
const underLock = (h: Harness, run: (locked: LockedWallet) => Promise<unknown>): Promise<unknown> =>
  h.repo.withLock(2, run);

test("an attendee is resolved by its key, never by counting the table", async () => {
  const present = harness({ "db.asistentes.findUnique": { id: 2 } });
  assert.equal(await present.repo.attendeeExists(2), true);
  assert.deepEqual(present.lastCallTo("db.asistentes.findUnique").args[0], { where: { id: 2 }, select: { id: true } });
  assert.deepEqual(present.log.map((c) => c.name), ["db.asistentes.findUnique"], "one lookup, and nothing else");

  const absent = harness();
  assert.equal(await absent.repo.attendeeExists(2), false);
});

test("the lock is taken inside the transaction with the values bound, not interpolated", async () => {
  const h = harness();
  await h.repo.withLock(7, async () => "done");

  assert.equal(h.log[0]?.name, "db.$transaction", "the lock cannot outlive the transaction it opens");
  const lock = h.callsTo("tx.$executeRaw")[0];
  assert.ok(lock, "the transaction has to take the lock");
  assert.match(String(lock.args[0]), /pg_advisory_xact_lock\(\?,\s*\?\)/);
  assert.deepEqual(lock.args[1], [10, 7], "a namespace this service owns and the attendee, as parameters");
});

test("a writer is given the transaction, and the queue is long enough for a burst", async () => {
  const h = harness();
  await underLock(h, async (locked) => {
    await locked.balance();
    await locked.movement(1);
  });

  assert.deepEqual(h.log.map((c) => c.name), [
    "db.$transaction",
    "tx.$executeRaw",
    "tx.$queryRaw",
    "tx.movimientos.findFirst",
  ]);
  const options = h.lastCallTo("db.$transaction").args[0] as { maxWait?: number; timeout?: number };
  assert.ok((options.maxWait ?? 0) >= 10_000, `the queue is given room, got ${JSON.stringify(options)}`);
  assert.ok((options.timeout ?? 0) >= 10_000);
});

test("the balance is one aggregate over active rows, evaluated by postgres", async () => {
  const h = harness({ $queryRaw: [{ saldo: 150_000n }] });
  assert.equal(await h.repo.balance(2), 150_000);

  const query = h.lastCallTo("db.$queryRaw");
  assert.match(String(query.args[0]), /SUM\(monto\) FILTER \(WHERE tipo = '\w+'\)/);
  assert.match(String(query.args[0]), /COALESCE/);
  assert.match(String(query.args[0]), /state = \?/, "a closed row is not part of the sum");
  assert.deepEqual(query.args[1], [2, "ACTIVE"], "the attendee and the state travel as parameters");
});

test("sum over int columns arrives as bigint and leaves as the contract's number", async () => {
  for (const [saldo, expected] of [
    [150_000n, 150_000],
    [-50_000n, -50_000],
    [0n, 0],
  ] as const) {
    assert.equal(await harness({ $queryRaw: [{ saldo }] }).repo.balance(2), expected);
  }
  assert.equal(await harness({ $queryRaw: [] }).repo.balance(2), 0, "an empty result is zero, not a crash");
});

test("a read by id asks for the contract projection and skips closed rows", async () => {
  const h = harness({ "db.movimientos.findFirst": ROW });
  assert.deepEqual(await h.repo.findActive(1), { ...ROW });
  const args = h.lastCallTo("db.movimientos.findFirst").args[0] as { where: unknown; select: Record<string, boolean> };
  assert.deepEqual(args.where, { id: 1, state: "ACTIVE" });
  assert.deepEqual(Object.keys(args.select).sort(), CONTRACT_COLUMNS, "created_at and updated_at stay in the database");
});

test("the count and the page are asked with the very same predicate", async () => {
  const h = harness({ "db.movimientos.findMany": [ROW], "db.movimientos.count": 7 });
  const page = await h.repo.list({ page: { limit: 10, offset: 20 }, attendeeId: 2, type: "CONSUMO" });

  assert.equal(page.total, 7);
  const listed = h.lastCallTo("db.movimientos.findMany").args[0] as Record<string, unknown>;
  const counted = h.lastCallTo("db.movimientos.count").args[0] as Record<string, unknown>;
  assert.deepEqual(listed.where, { state: "ACTIVE", asistente_id: 2, tipo: "CONSUMO" });
  assert.deepEqual(counted.where, listed.where, "a total that filters differently from its page is a lie");
  assert.deepEqual([listed.skip, listed.take, listed.orderBy], [20, 10, { id: "asc" }]);
});

test("an unfiltered listing still excludes closed rows", async () => {
  const h = harness();
  await h.repo.list({ page: { limit: 10, offset: 0 } });
  const listed = h.lastCallTo("db.movimientos.findMany").args[0] as { where: unknown; select: Record<string, boolean> };
  assert.deepEqual(listed.where, { state: "ACTIVE" });
  assert.deepEqual(Object.keys(listed.select).sort(), CONTRACT_COLUMNS, "the listing publishes the same six columns");
});

test("an edit is conditional on the row still being open", async () => {
  const edited = { ...ROW, descripcion: "Bar" };
  const h = harness({ "db.movimientos.updateManyAndReturn": [edited] });
  assert.deepEqual(await h.repo.updateDescription(1, "Bar"), edited);

  const args = h.lastCallTo("db.movimientos.updateManyAndReturn").args[0] as { where: unknown; data: Record<string, unknown> };
  assert.deepEqual(args.where, { id: 1, state: "ACTIVE" }, "a row closed while the request travelled is not edited");
  assert.equal(args.data.descripcion, "Bar");
  assert.ok(args.data.updated_at instanceof Date, "an edit that does not move updated_at is invisible");

  assert.equal(await harness().repo.updateDescription(1, "Bar"), null, "no row came back");
});

test("the insert writes the decision, not the request", async () => {
  const h = harness({ "tx.movimientos.create": ROW });
  await underLock(h, async (locked) => {
    assert.ok(await locked.apply(posting({ description: "Recarga en taquilla" })));
  });

  const data = h.lastCallTo("tx.movimientos.create").args[0] as { data: Record<string, unknown> };
  assert.deepEqual(data.data, {
    asistente_id: 2,
    tipo: "RECARGA",
    monto: 50_000,
    descripcion: "Recarga en taquilla",
    state: "ACTIVE",
  });
  assert.ok(!("created_at" in data.data), "the database stamps its own columns");
});

test("a movement posted without a description stores null, not the word undefined", async () => {
  const h = harness({ "tx.movimientos.create": { ...ROW, descripcion: null } });
  await underLock(h, async (locked) => {
    await locked.apply(posting());
  });
  const data = h.lastCallTo("tx.movimientos.create").args[0] as { data: Record<string, unknown> };
  assert.equal(data.data.descripcion, null);
});

test("closing a row is a conditional update that hands back what it closed", async () => {
  const closed = { ...ROW, state: "REMOVED" };
  const h = harness({ "tx.movimientos.updateManyAndReturn": [closed] });
  const result = await h.repo.withLock(2, (locked) =>
    locked.apply(posting({ direction: "debit", reverses: { id: 1, state: "ACTIVE" } })),
  );

  assert.deepEqual(result, closed, "the row the caller gets back is the row that was closed");
  const args = h.lastCallTo("tx.movimientos.updateManyAndReturn").args[0] as { where: unknown; data: Record<string, unknown> };
  assert.deepEqual(args.where, { id: 1, state: "ACTIVE" }, "the state the decision read is the condition of the write");
  assert.equal(args.data.state, "REMOVED");
  assert.equal(args.data.updated_at instanceof Date, true);
  assert.deepEqual(
    h.callsTo("tx.movimientos.create"),
    [],
    "a cancel closes a row, it does not post a compensating one",
  );
});

test("a row that stopped being open while the writer waited reports nothing to write", async () => {
  const h = harness({ "tx.movimientos.updateManyAndReturn": [] });
  const result = await h.repo.withLock(2, (locked) =>
    locked.apply(posting({ direction: "debit", reverses: { id: 1, state: "ACTIVE" } })),
  );
  assert.equal(result, null, "null is what the service turns into a 404");
});

test("no write reaches a table this module does not own", async () => {
  const h = harness({ "tx.movimientos.create": ROW, "tx.movimientos.updateManyAndReturn": [{ ...ROW, state: "REMOVED" }] });
  await h.repo.withLock(2, async (locked) => {
    await locked.apply(posting());
    await locked.apply(posting({ direction: "debit", reverses: { id: 1, state: "ACTIVE" } }));
  });
  await h.repo.updateDescription(1, "Bar");
  await h.repo.list({ page: { limit: 10, offset: 0 } });
  await h.repo.balance(2);
  await h.repo.findActive(1);
  await h.repo.attendeeExists(2);

  const assistants = h.log.filter((c) => c.name.includes("asistentes"));
  assert.deepEqual(
    assistants.map((c) => c.name),
    ["db.asistentes.findUnique"],
    "asistentes is read once and never written",
  );
  const written = h.log.filter((c) => /create|updateManyAndReturn/.test(c.name));
  assert.deepEqual(
    written.map((c) => c.name),
    ["tx.movimientos.create", "tx.movimientos.updateManyAndReturn", "db.movimientos.updateManyAndReturn"],
    "every write names movimientos and nothing else",
  );
});
