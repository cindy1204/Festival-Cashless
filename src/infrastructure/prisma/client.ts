import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

import { config } from "../../config.js";

let client: PrismaClient | undefined;

const create = (): PrismaClient =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.databaseUrl }),
    log: process.env.PRISMA_LOG === "1" ? ["warn", "error"] : ["error"],
  });

/** One client per process: the pool is what makes the transaction fast. */
export const prisma = (): PrismaClient => (client ??= create());

export const closePrisma = (): Promise<void> => (client ? client.$disconnect() : Promise.resolve());
