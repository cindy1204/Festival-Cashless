import { test } from "node:test";
import assert from "node:assert/strict";

import { DomainError, isDescription, isMoney, isMovementType, MONEY_MAX } from "../../src/domain/wallet.js";

test("tipo accepts only the two contract values", () => {
  assert.equal(isMovementType("RECARGA"), true);
  assert.equal(isMovementType("CONSUMO"), true);
  assert.equal(isMovementType("recarga"), false);
  assert.equal(isMovementType("TRANSFERENCIA"), false);
  assert.equal(isMovementType(null), false);
});

test("monto must be a positive integer inside the int column", () => {
  assert.equal(isMoney(50_000), true);
  assert.equal(isMoney(0), false);
  assert.equal(isMoney(-1), false);
  assert.equal(isMoney(1.5), false);
  assert.equal(isMoney(Number.MAX_SAFE_INTEGER), false);
  assert.equal(isMoney(MONEY_MAX), true);
  assert.equal(isMoney(MONEY_MAX + 1), false);
});

test("descripcion accepts at most 200 characters", () => {
  assert.equal(isDescription(""), true);
  assert.equal(isDescription("a".repeat(200)), true);
  assert.equal(isDescription("a".repeat(201)), false);
  assert.equal(isDescription(42), false);
});

test("DomainError carries a closed error code", () => {
  const error = new DomainError("CONFLICT", "insufficient balance");
  assert.ok(error instanceof Error);
  assert.equal(error.code, "CONFLICT");
  assert.equal(error.message, "insufficient balance");
});
