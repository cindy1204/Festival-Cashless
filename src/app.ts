import { pathToFileURL } from "node:url";

import express, { type Express } from "express";

import { WalletService } from "./application/wallet-service.js";
import type { WalletRepository } from "./application/ports/wallet-repository.js";
import { config } from "./config.js";
import { closePrisma, prisma } from "./infrastructure/prisma/client.js";
import { PrismaWalletRepository } from "./infrastructure/prisma/wallet-repository.js";
import { errorHandler, routeNotFound } from "./http/errors.js";
import { walletRoutes } from "./http/routes.js";

/** The app is a pure function of its repository, so tests can mount it in process. */
export const createApp = (repo: WalletRepository = new PrismaWalletRepository(prisma())): Express => {
  const app = express();
  app.use(express.json());
  app.use("/api", walletRoutes(new WalletService(repo)));
  app.use(routeNotFound);
  app.use(errorHandler);
  return app;
};

/** The process owns the port and the pool, and closes both on a termination signal. */
const start = (): void => {
  const server = createApp().listen(config.port, () => console.log(`[wallet] listening on ${config.port}`));
  const shutdown = (signal: string) => () => {
    console.log(`[wallet] ${signal} received, closing`);
    server.close(() => void closePrisma().then(() => process.exit(0)));
  };
  process.once("SIGINT", shutdown("SIGINT"));
  process.once("SIGTERM", shutdown("SIGTERM"));
};

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  start();
}
