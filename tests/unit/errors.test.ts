import { test } from "node:test";
import assert from "node:assert/strict";

import { DomainError } from "../../src/domain/wallet.js";
import { errorHandler, routeNotFound } from "../../src/http/errors.js";

interface Reply {
  status: (code: number) => Reply;
  headersSent: boolean;
  body: unknown;
  json: (body: unknown) => Reply;
  code: number;
}

/** The handler is an express error handler, so it is called the way express calls it. */
const handle = (error: unknown): Reply => {
  const reply: Reply = {
    code: 0,
    headersSent: false,
    body: undefined,
    status(code) {
      reply.code = code;
      return reply;
    },
    json(body) {
      reply.body = body;
      return reply;
    },
  };
  errorHandler(error, {} as never, reply as never, () => undefined);
  return reply;
};

test("a domain code decides the status and the message survives", () => {
  for (const [code, status] of [
    ["VALIDATION", 400],
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
  ] as const) {
    const res = handle(new DomainError(code, "a message"));
    assert.equal(res.code, status);
    assert.deepEqual(res.body, { error: "a message" });
  }
});

test("a body the parser rejected is the caller's mistake", () => {
  const res = handle(Object.assign(new SyntaxError("Unexpected token }"), { type: "entity.parse.failed" }));
  assert.equal(res.code, 400);
  assert.deepEqual(res.body, { error: "request body is not valid JSON" });
});

test("a transaction that could not start is a busy service, not a broken one", () => {
  const res = handle(Object.assign(new Error("Unable to start a transaction in the given time."), { code: "P2028" }));
  assert.equal(res.code, 503, "the request was fine and may succeed on a retry");
  assert.deepEqual(res.body, { error: "the service is busy, try again" });
});

test("an unknown failure says nothing about itself", (t) => {
  t.mock.method(console, "error", () => undefined);
  const res = handle(new Error("connection to postgres://user:hunter2@host/db refused"));
  assert.equal(res.code, 500);
  assert.deepEqual(res.body, { error: "internal server error" });
  const body = JSON.stringify(res.body);
  assert.equal(body.includes("hunter2"), false, "no secret leaves the service");
  assert.equal(body.includes("postgres://"), false, "and neither does the connection string");
});

test("a request for a route that does not exist is a 404", () => {
  let handed: unknown;
  routeNotFound({} as never, {} as never, (error: unknown) => (handed = error));
  assert.ok(handed instanceof DomainError);
  assert.equal((handed as DomainError).code, "NOT_FOUND");
});
