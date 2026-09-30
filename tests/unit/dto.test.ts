import { test } from "node:test";
import assert from "node:assert/strict";

import { DomainError } from "../../src/domain/wallet.js";
import { parseNewMovement, positiveInt } from "../../src/http/dto.js";

const code = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof DomainError, "expected a DomainError");
    return error.code;
  }
  return assert.fail("expected the parser to reject the payload");
};

test("a well formed recharge is parsed into a typed movement", () => {
  assert.deepEqual(parseNewMovement({ asistente_id: 2, tipo: "RECARGA", monto: 50_000, descripcion: "Test recharge" }), {
    asistente_id: 2,
    tipo: "RECARGA",
    monto: 50_000,
    descripcion: "Test recharge",
  });
});

test("descripcion is optional and a null is treated as absent", () => {
  assert.deepEqual(parseNewMovement({ asistente_id: 2, tipo: "CONSUMO", monto: 1_000 }), {
    asistente_id: 2,
    tipo: "CONSUMO",
    monto: 1_000,
  });
  assert.equal(parseNewMovement({ asistente_id: 2, tipo: "CONSUMO", monto: 1_000, descripcion: null }).descripcion, undefined);
});

test("a missing body is a validation error", () => {
  assert.equal(code(() => parseNewMovement({})), "VALIDATION");
  assert.equal(code(() => parseNewMovement(undefined)), "VALIDATION");
  assert.equal(code(() => parseNewMovement("nope")), "VALIDATION");
});

test("shape and type are rejected before any range check", () => {
  assert.equal(code(() => parseNewMovement({ asistente_id: "2", tipo: "RECARGA", monto: 50_000 })), "VALIDATION");
  assert.equal(code(() => parseNewMovement({ asistente_id: 2, tipo: "OTRO", monto: 50_000 })), "VALIDATION");
  assert.equal(code(() => parseNewMovement({ asistente_id: 2, tipo: "CONSUMO", monto: 0 })), "VALIDATION");
  assert.equal(code(() => parseNewMovement({ asistente_id: 2, tipo: "CONSUMO", monto: 1.5 })), "VALIDATION");
});

test("recharge amounts are bounded on both ends", () => {
  const recharge = (monto: number) => () => parseNewMovement({ asistente_id: 2, tipo: "RECARGA", monto });
  assert.equal(code(recharge(9_999)), "VALIDATION");
  assert.equal(code(recharge(2_000_001)), "VALIDATION");
  assert.equal(parseNewMovement({ asistente_id: 2, tipo: "RECARGA", monto: 10_000 }).monto, 10_000);
  assert.equal(parseNewMovement({ asistente_id: 2, tipo: "RECARGA", monto: 2_000_000 }).monto, 2_000_000);
});

test("a consumption of one peso is enough", () => {
  assert.equal(parseNewMovement({ asistente_id: 2, tipo: "CONSUMO", monto: 1 }).monto, 1);
});

test("descripcion longer than the column is rejected", () => {
  assert.equal(code(() => parseNewMovement({ asistente_id: 2, tipo: "CONSUMO", monto: 1, descripcion: "a".repeat(201) })), "VALIDATION");
  assert.equal(parseNewMovement({ asistente_id: 2, tipo: "CONSUMO", monto: 1, descripcion: "a".repeat(200) }).descripcion?.length, 200);
});

test("route ids are parsed as positive integers", () => {
  assert.equal(positiveInt("42", "id"), 42);
  assert.equal(positiveInt(42, "id"), 42);
  for (const invalid of ["abc", "0", "-1", "1.5", "", undefined, null]) {
    assert.equal(code(() => positiveInt(invalid, "id")), "VALIDATION");
  }
});
