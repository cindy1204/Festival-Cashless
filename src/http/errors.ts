import { DomainError, type ErrorCode } from "../domain/wallet.js";
import type { NextFunction, Request, Response } from "express";

/** The contract maps each domain code to exactly one status. */
const STATUS: Record<ErrorCode, number> = { VALIDATION: 400, NOT_FOUND: 404, CONFLICT: 409 };

export const notFound = (message: string): DomainError => new DomainError("NOT_FOUND", message);

export const routeNotFound = (_req: Request, _res: Response, next: NextFunction): void => {
  next(notFound("route not found"));
};

export const errorHandler = (error: unknown, _req: Request, res: Response, next: NextFunction): void => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof DomainError) {
    res.status(STATUS[error.code]).json({ error: error.message });
    return;
  }
  if (isMalformedBody(error)) {
    res.status(400).json({ error: "request body is not valid JSON" });
    return;
  }
  // Unexpected failures never leak a message or a stack trace to the client.
  console.error("[wallet] unexpected error", error);
  res.status(500).json({ error: "internal server error" });
};

/** The body parser reports a broken payload as a request error, not as a bug. */
const isMalformedBody = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "type" in error && error.type === "entity.parse.failed";
