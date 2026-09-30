import { test } from "node:test";
import assert from "node:assert/strict";

import { post, type LedgerIntent, type WalletSnapshot } from "../../src/domain/ledger.js";
import { MONEY_MAX } from "../../src/domain/wallet.js";

const wallet = (balance: number, over: Partial<WalletSnapshot> = {}): WalletSnapshot => ({ attendeeId: 4, balance, ...over });

const code = (intent: LedgerIntent, snapshot: WalletSnapshot) => {
  const result = post(intent, snapshot);
  assert.equal(result.ok, false, "expected a refusal");
  return result.ok ? "" : result.error.code;
};

test("an amount that is not a whole number of pesos is refused before anything is read", () => {
  for (const amount of [1.5, 0.1, -0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2]) {
    assert.equal(code({ kind: "recharge", attendeeId: 4, amount }, wallet(0)), "VALIDATION", `amount ${amount}`);
  }
});

test("an amount the column cannot store is refused instead of reaching the driver", () => {
  assert.equal(code({ kind: "recharge", attendeeId: 4, amount: MONEY_MAX + 1 }, wallet(0)), "VALIDATION");
  assert.equal(post({ kind: "recharge", attendeeId: 4, amount: MONEY_MAX }, wallet(0)).ok, true);
});

test("an attendee that is not a positive integer is refused", () => {
  for (const attendeeId of [0, -1, 1.5, Number.NaN]) {
    assert.equal(code({ kind: "recharge", attendeeId, amount: 10_000 }, wallet(0)), "VALIDATION", `attendee ${attendeeId}`);
  }
});

test("a movement id that is not a positive integer is refused", () => {
  for (const movementId of [0, -3, 2.5]) {
    assert.equal(code({ kind: "reversal", movementId }, wallet(0)), "VALIDATION", `movement ${movementId}`);
  }
});

test("a balance that is not a whole number is a conflict, not a silent posting", () => {
  for (const balance of [Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    assert.equal(code({ kind: "recharge", attendeeId: 4, amount: 10_000 }, wallet(balance)), "CONFLICT", `balance ${balance}`);
  }
});

test("a negative stored balance is accepted as a fact and still cannot be debited", () => {
  const result = post({ kind: "consumption", attendeeId: 4, amount: 1 }, wallet(-5));
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.error.code, "CONFLICT");
});

test("the checks run before the balance, so a bad request never reports a conflict", () => {
  assert.equal(code({ kind: "consumption", attendeeId: 4, amount: -1 }, wallet(0)), "VALIDATION");
  assert.equal(code({ kind: "consumption", attendeeId: 4, amount: 10_000_000 }, wallet(0)), "CONFLICT", "a valid but unaffordable amount is a conflict");
});

test("a reversal of a well formed id with no active entry is still a not found", () => {
  const result = post({ kind: "reversal", movementId: 7 }, wallet(0));
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.error.code, "NOT_FOUND");
});
