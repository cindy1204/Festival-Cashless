import { test } from "node:test";
import assert from "node:assert/strict";

import { bodyInt, parseDescriptionPatch, parseNewMovement, positiveInt } from "../../src/http/dto.js";
import { DomainError } from "../../src/domain/wallet.js";

const rejects = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof DomainError, `expected a DomainError, got ${String(error)}`);
    return error.code;
  }
  throw new Error("expected a refusal");
};

const message = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a refusal");
};

test("a patch that only carries a description is the one accepted shape", () => {
  assert.equal(parseDescriptionPatch({ descripcion: "Bar" }), "Bar");
  assert.equal(parseDescriptionPatch({ descripcion: "" }), "", "an empty string is still text");
  assert.equal(parseDescriptionPatch({ descripcion: " con espacios " }), " con espacios ");
});

test("the whitelist names the first key that is not editable", () => {
  assert.equal(message(() => parseDescriptionPatch({ monto: 1 })), "monto is not editable");
  assert.equal(message(() => parseDescriptionPatch({ descripcion: "Bar", state: "REMOVED" })), "state is not editable");
  assert.equal(message(() => parseDescriptionPatch({ descripcion: "Bar", monto: 0 })), "monto is not editable");
});

test("a patch that changes nothing is refused", () => {
  assert.equal(rejects(() => parseDescriptionPatch({})), "VALIDATION");
  assert.equal(message(() => parseDescriptionPatch({})), "descripcion is the only editable field");
});

test("a body that is not an object cannot smuggle a field in", () => {
  for (const body of [null, undefined, "descripcion", 42, true]) {
    assert.equal(rejects(() => parseDescriptionPatch(body)), "VALIDATION", `body ${String(body)}`);
  }
});

test("a null description is refused instead of erasing the text", () => {
  assert.equal(rejects(() => parseDescriptionPatch({ descripcion: null })), "VALIDATION");
  assert.equal(message(() => parseDescriptionPatch({ descripcion: null })), "descripcion must be a string");
});

test("a description of the wrong type is refused and a long one is bounded", () => {
  assert.equal(rejects(() => parseDescriptionPatch({ descripcion: 42 })), "VALIDATION");
  assert.equal(rejects(() => parseDescriptionPatch({ descripcion: ["a"] })), "VALIDATION");
  assert.equal(rejects(() => parseDescriptionPatch({ descripcion: { a: 1 } })), "VALIDATION");
  assert.equal(rejects(() => parseDescriptionPatch({ descripcion: "a".repeat(201) })), "VALIDATION");
  assert.equal(parseDescriptionPatch({ descripcion: "a".repeat(200) })?.length, 200);
});

test("a prototype key is not editable either", () => {
  const body = JSON.parse('{"__proto__": {"admin": true}}');
  assert.equal(rejects(() => parseDescriptionPatch(body)), "VALIDATION");
  assert.equal(({} as Record<string, unknown>).admin, undefined, "the prototype is untouched");
});

test("a create accepts an absent or null description and refuses the rest", () => {
  const base = { asistente_id: 1, tipo: "CONSUMO", monto: 100 };
  assert.deepEqual(parseNewMovement(base), base);
  assert.deepEqual(parseNewMovement({ ...base, descripcion: null }), base);
  assert.deepEqual(parseNewMovement({ ...base, descripcion: "Bar" }), { ...base, descripcion: "Bar" });
  assert.equal(rejects(() => parseNewMovement({ ...base, descripcion: 5 })), "VALIDATION");
  assert.equal(rejects(() => parseNewMovement({ ...base, descripcion: "a".repeat(201) })), "VALIDATION");
});

test("a query value arrives as text and a body value never does", () => {
  assert.equal(positiveInt("42", "page"), 42);
  assert.equal(positiveInt(42, "page"), 42);
  assert.equal(rejects(() => positiveInt("42.5", "page")), "VALIDATION");
  assert.equal(rejects(() => positiveInt("", "page")), "VALIDATION");
  assert.equal(rejects(() => positiveInt("1e3", "page")), "VALIDATION", "exponent notation is not a page");
  assert.equal(rejects(() => positiveInt("0x10", "page")), "VALIDATION", "hexadecimal is not a page");
  assert.equal(rejects(() => positiveInt(" 42 ", "page")), "VALIDATION", "a page is not trimmed into a number");
  assert.equal(rejects(() => positiveInt("42.0", "page")), "VALIDATION", "a decimal page is not a page");
  assert.equal(rejects(() => positiveInt(["1", "2"], "page")), "VALIDATION", "a repeated parameter is not a value");

  assert.equal(bodyInt(42, "monto"), 42);
  assert.equal(rejects(() => bodyInt("42", "monto")), "VALIDATION");
  assert.equal(rejects(() => bodyInt(null, "monto")), "VALIDATION");
  assert.equal(rejects(() => bodyInt(Number.NaN, "monto")), "VALIDATION");
  assert.equal(rejects(() => bodyInt(Number.POSITIVE_INFINITY, "monto")), "VALIDATION");
  assert.equal(rejects(() => bodyInt(0, "monto")), "VALIDATION");
});
