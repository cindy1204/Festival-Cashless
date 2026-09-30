import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { createApp } from "../../src/app.js";
import { closePrisma, prisma } from "../../src/infrastructure/prisma/client.js";
import { PrismaWalletRepository } from "../../src/infrastructure/prisma/wallet-repository.js";

/**
 * For `npm run test:db` only. This harness starts a real server against a real
 * PostgreSQL, so it needs a DATABASE_URL and it leaves rows behind if it dies.
 * Nothing in the default suite may import it: a mock cannot prove that two
 * transactions do not both read the same balance, so the properties that need
 * a database are opt in and run deliberately.
 */
export const TAG = "wallet-test";

if (!process.env.DATABASE_URL) {
  throw new Error("npm run test:db needs DATABASE_URL pointing at a PostgreSQL you are willing to write to");
}

let server: Server | undefined;
const created = new Set<number>();

export const baseUrl = async (): Promise<string> => {
  if (!server) {
    server = createApp(new PrismaWalletRepository(prisma())).listen(0);
    await new Promise((resolve) => server?.once("listening", resolve));
    server.unref();
  }
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
};

export const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> => {
  const init: RequestInit = { method, signal: AbortSignal.timeout(15_000) };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const response = await fetch((await baseUrl()) + path, init);
  const text = await response.text();
  const parsed: any = text ? JSON.parse(text) : null;
  if (response.status === 201 && typeof parsed?.data?.id === "number") {
    created.add(parsed.data.id);
  }
  return { status: response.status, body: parsed };
};

export const create = async (asistente_id: number, tipo: "RECARGA" | "CONSUMO", monto: number, description = TAG): Promise<any> => {
  const { status, body } = await call("POST", "/api/movimientos", { asistente_id, tipo, monto, descripcion: description });
  if (status !== 201) {
    throw new Error(`create failed: ${status} ${JSON.stringify(body)}`);
  }
  return body.data;
};

export const saldo = async (attendeeId: number): Promise<number> => (await call("GET", `/api/billeteras/${attendeeId}/saldo`)).body.data.saldo;

export const purge = async (): Promise<void> => {
  if (created.size > 0) {
    await prisma().movimientos.deleteMany({ where: { id: { in: [...created] } } });
    created.clear();
  }
};

/** Removes only the rows this run created, by tag or by id, and nothing else. */
export const cleanup = async (): Promise<void> => {
  await prisma().movimientos.deleteMany({ where: { OR: [{ descripcion: { startsWith: TAG } }, { id: { in: [...created] } }] } });
  created.clear();
  await closePrisma();
  server?.close();
  server = undefined;
};
