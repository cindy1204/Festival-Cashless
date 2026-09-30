import { test } from "node:test";
import assert from "node:assert/strict";

import { post, type LedgerIntent, type WalletSnapshot } from "../../src/domain/ledger.js";

const decide = (intent: LedgerIntent, snapshot: WalletSnapshot) => {
  const result = post(intent, snapshot);
  assert.equal(result.ok, true, result.ok ? "" : result.error.message);
  return result.ok ? result.posting : undefined;
};

const refuse = (intent: LedgerIntent, snapshot: WalletSnapshot) => {
  const result = post(intent, snapshot);
  assert.equal(result.ok, false, "expected the ledger to refuse");
  return result.ok ? undefined : result.error;
};

test("a recharge credits the balance and plans the entry to write", () => {
  const posting = decide({ kind: "recharge", attendeeId: 4, amount: 10_000 }, { attendeeId: 4, balance: 0 });
  assert.deepEqual(posting, {
    direction: "credit",
    amount: 10_000,
    attendeeId: 4,
    type: "RECARGA",
    balanceBefore: 0,
    balanceAfter: 10_000,
    reverses: null,
  });
});

test("a consumption is accepted when it fits exactly", () => {
  const posting = decide({ kind: "consumption", attendeeId: 4, amount: 50_000 }, { attendeeId: 4, balance: 50_000 });
  assert.equal(posting?.balanceAfter, 0);
  assert.equal(posting?.direction, "debit");
});

test("a consumption that would go negative is a conflict", () => {
  const error = refuse({ kind: "consumption", attendeeId: 4, amount: 50_001 }, { attendeeId: 4, balance: 50_000 });
  assert.equal(error?.code, "CONFLICT");
});

test("closing a consumption gives its amount back", () => {
  const posting = decide(
    { kind: "reversal", movementId: 7 },
    { attendeeId: 4, balance: 20_000, entry: { id: 7, attendeeId: 4, type: "CONSUMO", amount: 30_000 } },
  );
  assert.deepEqual(posting, {
    direction: "credit",
    amount: 30_000,
    attendeeId: 4,
    type: "CONSUMO",
    balanceBefore: 20_000,
    balanceAfter: 50_000,
    reverses: { id: 7, state: "ACTIVE" },
  });
});

test("closing a recharge subtracts it and is refused when it goes negative", () => {
  const entry = { id: 7, attendeeId: 4, type: "RECARGA", amount: 50_000 } as const;
  assert.equal(decide({ kind: "reversal", movementId: 7 }, { attendeeId: 4, balance: 50_000, entry })?.balanceAfter, 0);
  assert.equal(refuse({ kind: "reversal", movementId: 7 }, { attendeeId: 4, balance: 49_999, entry })?.code, "CONFLICT");
});

test("closing an entry that is not active is a not found", () => {
  assert.equal(refuse({ kind: "reversal", movementId: 7 }, { attendeeId: 4, balance: 0 })?.code, "NOT_FOUND");
});

test("the decision is pure: the same input always yields the same posting", () => {
  const intent: LedgerIntent = { kind: "consumption", attendeeId: 2, amount: 1_000, description: "Bar" };
  const snapshot: WalletSnapshot = { attendeeId: 2, balance: 2_000 };
  assert.deepEqual(decide(intent, snapshot), decide(intent, snapshot));
  assert.deepEqual(snapshot, { attendeeId: 2, balance: 2_000 });
});
