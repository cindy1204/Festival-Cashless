import { test } from "node:test";
import assert from "node:assert/strict";

import { compile, type WalletIntent, type WalletSnapshot } from "../../src/domain/compiler.js";

const decide = (intent: WalletIntent, snapshot: WalletSnapshot) => {
  const result = compile(intent, snapshot);
  assert.equal(result.ok, true, result.ok ? "" : result.error.message);
  return result.ok ? result.plan : undefined;
};

const refuse = (intent: WalletIntent, snapshot: WalletSnapshot) => {
  const result = compile(intent, snapshot);
  assert.equal(result.ok, false, "expected the compiler to refuse");
  return result.ok ? undefined : result.error;
};

test("a recharge adds to the balance and plans an insert", () => {
  const plan = decide({ kind: "recharge", attendeeId: 4, amount: 10_000 }, { balance: 0 });
  assert.deepEqual(plan, {
    effect: "insert",
    attendeeId: 4,
    type: "RECARGA",
    amount: 10_000,
    balanceAfter: 10_000,
  });
});

test("a consumption is accepted when it fits exactly", () => {
  const plan = decide({ kind: "consumption", attendeeId: 4, amount: 50_000 }, { balance: 50_000 });
  assert.equal(plan?.balanceAfter, 0);
  assert.equal(plan?.effect, "insert");
});

test("a consumption that would go negative is a conflict", () => {
  const error = refuse({ kind: "consumption", attendeeId: 4, amount: 50_001 }, { balance: 50_000 });
  assert.equal(error?.code, "CONFLICT");
});

test("cancelling a consumption returns its amount", () => {
  const plan = decide(
    { kind: "cancel", movementId: 7 },
    { balance: 20_000, movement: { id: 7, attendeeId: 4, type: "CONSUMO", amount: 30_000 } },
  );
  assert.deepEqual(plan, { effect: "remove", attendeeId: 4, movementId: 7, balanceAfter: 50_000 });
});

test("cancelling a recharge subtracts it and is refused when it goes negative", () => {
  const movement = { id: 7, attendeeId: 4, type: "RECARGA", amount: 50_000 } as const;
  assert.equal(decide({ kind: "cancel", movementId: 7 }, { balance: 50_000, movement })?.balanceAfter, 0);
  assert.equal(refuse({ kind: "cancel", movementId: 7 }, { balance: 49_999, movement })?.code, "CONFLICT");
});

test("cancelling a movement that is not active is a not found", () => {
  assert.equal(refuse({ kind: "cancel", movementId: 7 }, { balance: 0 })?.code, "NOT_FOUND");
});

test("the compiler is pure: the same input always yields the same plan", () => {
  const intent: WalletIntent = { kind: "consumption", attendeeId: 2, amount: 1_000, description: "Bar" };
  const snapshot: WalletSnapshot = { balance: 2_000 };
  assert.deepEqual(decide(intent, snapshot), decide(intent, snapshot));
  assert.deepEqual(snapshot, { balance: 2_000 });
});
