import { request } from "node:http";
import type { AddressInfo, Server } from "node:net";

import { createApp } from "../../src/app.js";
import { FakeWalletRepository } from "./fake-wallet-repository.js";

/**
 * The application is served over a real socket on an ephemeral loopback port and
 * driven the way a client drives it: a request goes out, the event loop turns,
 * and the answer comes back whenever it comes back.
 *
 * Nothing here resolves a name, reaches a database or hard-codes a port, so the
 * suite still says something about the code and not about the day. What it does
 * have over a synthetic in-process request is true asynchronous I/O: requests
 * genuinely interleave, the json parser is the real one, and a test that needs
 * twenty-four writers in flight at the same moment really gets twenty-four
 * writers in flight at the same moment.
 */

/** Marks every row a test creates, so nothing is confused with the opening balance. */
export const TAG = "wallet-test";

export const wallet = new FakeWalletRepository();
const app = createApp(wallet);

let origin: string | undefined;

/**
 * Started on the first request, on port 0 so the operating system picks a free
 * one, and left unref'd so a finished suite can exit without a teardown dance.
 */
const listening = (): Promise<string> => {
  if (origin !== undefined) {
    return Promise.resolve(origin);
  }
  return new Promise<string>((resolve, reject) => {
    const server: Server = app.listen(0, "127.0.0.1", () => {
      server.unref();
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve(origin);
    });
    server.once("error", reject);
  });
};

/**
 * The address the application is actually reachable at. Exported so a test can
 * prove the listener is a real one by talking to this port with another client.
 */
export const address = async (): Promise<string> => listening();

/** Every request gets its own connection: no pooled socket outlives its test. */
const TIMEOUT = 5_000;

const send = (base: string, method: string, path: string, payload?: Buffer): Promise<{ status: number; text: string }> =>
  new Promise((resolve, reject) => {
    const req = request(`${base}${path}`, { method, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.setTimeout(TIMEOUT, () => req.destroy(new Error(`${method} ${path} did not answer in ${TIMEOUT}ms`)));
    req.once("error", reject);
    if (payload !== undefined) {
      req.setHeader("content-type", "application/json");
      req.setHeader("content-length", payload.length);
      req.write(payload);
    }
    req.end();
  });

export interface Response {
  status: number;
  body: any;
}

/** The same request every test has always made, now over a socket instead of a shim. */
export const call = async (method: string, path: string, body?: unknown): Promise<Response> => {
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  const { status, text } = await send(await listening(), method, path, payload);
  return { status, body: text ? JSON.parse(text) : null };
};

/** The opening rows of a wallet that the suite never writes to. */
const opening = (): void => {
  wallet.seed(1, "RECARGA", 200_000);
  wallet.seed(1, "CONSUMO", 50_000);
};

export const reset = (): void => {
  wallet.release();
  wallet.rows.clear();
  wallet.nextId = 1000;
  wallet.locks = 0;
  wallet.peak = 0;
  wallet.peakQueued = 0;
  wallet.inside = 0;
  wallet.queued = 0;
  opening();
};

export const create = async (asistente_id: number, tipo: "RECARGA" | "CONSUMO", monto: number, description = TAG): Promise<any> => {
  const { status, body } = await call("POST", "/api/movimientos", { asistente_id, tipo, monto, descripcion: description });
  if (status !== 201) {
    throw new Error(`create failed: ${status} ${JSON.stringify(body)}`);
  }
  return body.data;
};

export const saldo = async (attendeeId: number): Promise<number> => (await call("GET", `/api/billeteras/${attendeeId}/saldo`)).body.data.saldo;
