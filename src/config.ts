const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

export const config = {
  port,
  databaseUrl: process.env.DATABASE_URL ?? "",
} as const;
