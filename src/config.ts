import "dotenv/config";

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

const transactionMaxWait = Number(process.env.TRANSACTION_MAX_WAIT_MS ?? 15_000);
const transactionTimeout = Number(process.env.TRANSACTION_TIMEOUT_MS ?? 15_000);

if (!Number.isInteger(transactionMaxWait) || transactionMaxWait < 1) {
  throw new Error(`Invalid TRANSACTION_MAX_WAIT_MS: ${process.env.TRANSACTION_MAX_WAIT_MS}`);
}
if (!Number.isInteger(transactionTimeout) || transactionTimeout < 1) {
  throw new Error(`Invalid TRANSACTION_TIMEOUT_MS: ${process.env.TRANSACTION_TIMEOUT_MS}`);
}

export const config = {
  port,
  databaseUrl: process.env.DATABASE_URL ?? "",
  transaction: {
    maxWait: transactionMaxWait,
    timeout: transactionTimeout,
  },
} as const;
