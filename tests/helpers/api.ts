import { inject } from "light-my-request";

import { createApp } from "../../src/app.js";
import { FakeWalletRepository } from "./fake-wallet-repository.js";

/** Marks every row a test creates, so nothing is confused with the opening balance. */
export const TAG = "wallet-test";

/**
 * The application is driven in process. A request is handed to the same express
 * app the server would use, and the answer is read back, so no suite opens a
 * socket, resolves a name or reaches a database. A test that needs a row to
 * exist asks the fake for it, the way it would ask a fixture.
 */
export const wallet = new FakeWalletRepository();
const app = createApp(wallet);

/** The opening rows of a wallet that the suite never writes to. */
const opening = (): void => {
  wallet.seed(1, "RECARGA", 200_000);
  wallet.seed(1, "CONSUMO", 50_000);
};

export const reset = (): void => {
  wallet.rows.clear();
  wallet.nextId = 1000;
  opening();
};

export interface Response {
  status: number;
  body: any;
}

export const call = async (method: string, path: string, body?: unknown): Promise<Response> => {
  const request = {
    method,
    url: path,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, payload: JSON.stringify(body) }),
  };
  const reply = await inject(app as never, request as never);
  const text = reply.payload === undefined || reply.payload === "" ? "" : String(reply.payload);
  return { status: reply.statusCode, body: text ? JSON.parse(text) : null };
};

export const create = async (asistente_id: number, tipo: "RECARGA" | "CONSUMO", monto: number, description = TAG): Promise<any> => {
  const { status, body } = await call("POST", "/api/movimientos", { asistente_id, tipo, monto, descripcion: description });
  if (status !== 201) {
    throw new Error(`create failed: ${status} ${JSON.stringify(body)}`);
  }
  return body.data;
};

export const saldo = async (attendeeId: number): Promise<number> => (await call("GET", `/api/billeteras/${attendeeId}/saldo`)).body.data.saldo;
