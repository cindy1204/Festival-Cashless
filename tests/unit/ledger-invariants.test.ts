import { test } from "node:test";
import assert from "node:assert/strict";

import { post, type ActiveEntry, type LedgerIntent, type Posting, type WalletSnapshot } from "../../src/domain/ledger.js";
import { DomainError } from "../../src/domain/wallet.js";

const decide = (intent: LedgerIntent, snapshot: WalletSnapshot): Posting => {
  const result = post(intent, snapshot);
  assert.equal(result.ok, true, result.ok ? "" : result.error.message);
  if (!result.ok) {
    throw new Error("unreachable");
  }
  return result.posting;
};

const refuse = (intent: LedgerIntent, snapshot: WalletSnapshot): DomainError => {
  const result = post(intent, snapshot);
  assert.equal(result.ok, false, "expected the ledger to refuse");
  if (result.ok) {
    throw new Error("unreachable");
  }
  return result.error;
};

const entry = (over: Partial<ActiveEntry> = {}): ActiveEntry => ({
  id: 7,
  attendeeId: 4,
  type: "CONSUMO",
  amount: 30_000,
  ...over,
});

const wallet = (balance: number, over: Partial<WalletSnapshot> = {}): WalletSnapshot => ({
  attendeeId: 4,
  balance,
  ...over,
});

test("the two directions mirror each other around the same balance", () => {
  const credit = decide({ kind: "recharge", attendeeId: 4, amount: 10_000 }, wallet(20_000));
  const debit = decide({ kind: "consumption", attendeeId: 4, amount: 10_000 }, wallet(20_000));
  assert.equal(credit.direction, "credit");
  assert.equal(debit.direction, "debit");
  assert.equal(credit.balanceAfter, 30_000);
  assert.equal(debit.balanceAfter, 10_000);
});

test("the amount of a posting is always positive and the direction carries the sign", () => {
  const credit = decide({ kind: "recharge", attendeeId: 4, amount: 10_000 }, wallet(0));
  const debit = decide({ kind: "consumption", attendeeId: 4, amount: 10_000 }, wallet(10_000));
  assert.ok(credit.amount > 0);
  assert.ok(debit.amount > 0);
});

test("a posting satisfies balanceAfter = balanceBefore + signed amount", () => {
  for (const posting of [
    decide({ kind: "recharge", attendeeId: 4, amount: 10_000, description: "Cash" }, wallet(1_000)),
    decide({ kind: "consumption", attendeeId: 4, amount: 999 }, wallet(1_000)),
    decide({ kind: "reversal", movementId: 7 }, wallet(1_000, { entry: entry() })),
    decide({ kind: "reversal", movementId: 8 }, wallet(90_000, { entry: entry({ id: 8, type: "RECARGA", amount: 80_000 }) })),
  ]) {
    const signed = posting.direction === "credit" ? posting.amount : -posting.amount;
    assert.equal(posting.balanceAfter, posting.balanceBefore + signed);
    assert.ok(Number.isSafeInteger(posting.balanceAfter));
    assert.ok(posting.balanceAfter >= 0);
  }
});

test("only a reversal names the entry it closes, and it names the state it read", () => {
  const insert = decide({ kind: "recharge", attendeeId: 4, amount: 10_000 }, wallet(0));
  assert.equal(insert.reverses, null);
  const close = decide({ kind: "reversal", movementId: 7 }, wallet(0, { entry: entry() }));
  assert.deepEqual(close.reverses, { id: 7, state: "ACTIVE" });
});

test("closing a recharge debits and closing a consumption credits, whatever the kind said", () => {
  const consumption = decide({ kind: "reversal", movementId: 7 }, wallet(1_000, { entry: entry({ type: "CONSUMO" }) }));
  const recharge = decide(
    { kind: "reversal", movementId: 8 },
    wallet(90_000, { entry: entry({ id: 8, type: "RECARGA", amount: 80_000 }) }),
  );
  assert.equal(consumption.direction, "credit");
  assert.equal(recharge.direction, "debit");
  assert.equal(recharge.type, "RECARGA", "the closed entry keeps its own type");
});

test("a snapshot whose entry belongs to another wallet is refused as a bug", () => {
  assert.throws(
    () => post({ kind: "reversal", movementId: 7 }, wallet(0, { entry: entry({ attendeeId: 5 }) })),
    /reversed entry 7 of attendee 5 while holding 4/,
  );
});

test("an entry of the right wallet is accepted, so the guard is not just noise", () => {
  const posting = decide({ kind: "reversal", movementId: 7 }, wallet(0, { entry: entry({ attendeeId: 4 }) }));
  assert.equal(posting.attendeeId, 4);
});

test("a zero balance is a legal snapshot, so a recharge from nothing is a credit", () => {
  const posting = decide({ kind: "recharge", attendeeId: 4, amount: 10_000 }, wallet(0));
  assert.equal(posting.balanceBefore, 0);
  assert.equal(posting.balanceAfter, 10_000);
});

test("the description is carried only when the intent had one", () => {
  assert.equal("description" in decide({ kind: "recharge", attendeeId: 4, amount: 10_000 }, wallet(0)), false);
  assert.equal(decide({ kind: "recharge", attendeeId: 4, amount: 10_000, description: "Cash" }, wallet(0)).description, "Cash");
  assert.equal("description" in decide({ kind: "reversal", movementId: 7 }, wallet(0, { entry: entry() })), false);
});

test("the balance boundary is decided once: the last peso is allowed, one more is not", () => {
  assert.equal(decide({ kind: "consumption", attendeeId: 4, amount: 1 }, wallet(1)).balanceAfter, 0);
  assert.equal(refuse({ kind: "consumption", attendeeId: 4, amount: 2 }, wallet(1)).code, "CONFLICT");
  assert.equal(refuse({ kind: "consumption", attendeeId: 4, amount: 1 }, wallet(0)).code, "CONFLICT");
});

test("closing a recharge that the balance now needs is refused before anything is written", () => {
  const recharge = entry({ id: 9, type: "RECARGA", amount: 50_000 });
  assert.equal(refuse({ kind: "reversal", movementId: 9 }, wallet(49_999, { entry: recharge })).code, "CONFLICT");
  assert.equal(decide({ kind: "reversal", movementId: 9 }, wallet(50_000, { entry: recharge })).balanceAfter, 0);
});

test("the decision reads the snapshot and never writes to it", () => {
  const snapshot = wallet(2_000, { entry: entry() });
  const before = structuredClone(snapshot);
  decide({ kind: "reversal", movementId: 7 }, snapshot);
  assert.deepEqual(snapshot, before);
});
