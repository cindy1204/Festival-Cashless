import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const PRINT_PORT = "const { config } = await import('./src/config.ts'); console.log(config.port);";

/**
 * The module reads the environment while it is imported, so each case gets its
 * own process. Asserting on the config object directly would only prove that a
 * value that was already loaded is still in memory.
 */
const portOf = async (port: string | undefined) => {
  const { stdout } = await run(process.execPath, ["--import", "tsx", "--input-type=module", "-e", PRINT_PORT], {
    env: { ...process.env, PORT: port },
  });
  return stdout.trim();
};

const failureOf = async (port: string) => {
  const error = await run(process.execPath, ["--import", "tsx", "--input-type=module", "-e", PRINT_PORT], {
    env: { ...process.env, PORT: port },
  }).then(() => null, (reason: { code: number; stderr: string }) => reason);
  return error;
};

test("a missing PORT falls back to 3000", async () => {
  assert.equal(await portOf(undefined), "3000");
});

test("a numeric PORT is taken as it is", async () => {
  assert.equal(await portOf("8080"), "8080");
});

test("a PORT above the valid range stops the process", async () => {
  const error = await failureOf("70000");
  assert.equal(error?.code, 1, "an unusable port must not reach the server");
  assert.match(error?.stderr ?? "", /Invalid PORT: 70000/);
});

test("a PORT that is not a number stops the process", async () => {
  const error = await failureOf("abc");
  assert.equal(error?.code, 1);
  assert.match(error?.stderr ?? "", /Invalid PORT: abc/);
});

test("a fractional PORT stops the process", async () => {
  const error = await failureOf("80.5");
  assert.equal(error?.code, 1);
  assert.match(error?.stderr ?? "", /Invalid PORT: 80\.5/);
});
