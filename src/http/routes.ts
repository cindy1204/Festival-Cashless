import { Router, type Request, type Response } from "express";

import type { MovementFilter } from "../application/ports/wallet-repository.js";
import { WalletService } from "../application/wallet-service.js";
import { DomainError, INT_MAX, isMovementType, type MovementType } from "../domain/wallet.js";
import { positiveInt } from "./dto.js";

const FIRST_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

interface Listing {
  readonly filter: MovementFilter;
  readonly currentPage: number;
  readonly limit: number;
}

/** Defaults, upper bound and filter validation in one place, shared by the count and the page. */
const listing = (query: Request["query"]): Listing => {
  const currentPage = positiveInt(query.page ?? FIRST_PAGE, "page");
  const limit = positiveInt(query.limit ?? DEFAULT_LIMIT, "limit");
  if (limit > MAX_LIMIT) {
    throw invalid(`limit must be at most ${MAX_LIMIT}`);
  }
  const { asistente_id, tipo } = query;
  return {
    filter: {
      page: { limit, offset: offsetOf(currentPage, limit) },
      ...(asistente_id === undefined ? {} : { attendeeId: positiveInt(asistente_id, "asistente_id") }),
      ...(tipo === undefined ? {} : { type: parseTipo(tipo) }),
    },
    currentPage,
    limit,
  };
};

/** The domain decides what a movement type is; this only reports it as a bad filter. */
const parseTipo = (value: unknown): MovementType => {
  if (!isMovementType(value)) {
    throw invalid("tipo must be RECARGA or CONSUMO");
  }
  return value;
};

/**
 * A page and a limit that are each valid still multiply into an offset the
 * `int` column cannot hold, so the product is the value that has to be bounded.
 */
const offsetOf = (currentPage: number, limit: number): number => {
  const offset = (currentPage - 1) * limit;
  if (offset > INT_MAX) {
    throw invalid(`page is too far to read`);
  }
  return offset;
};

export const walletRoutes = (service: WalletService): Router => {
  const router = Router();

  router.get("/movimientos", async (req: Request, res: Response) => {
    const { filter, currentPage, limit } = listing(req.query);
    const { rows, total } = await service.list(filter);
    res.json({ pagination: { total, currentPage, limit, totalPages: Math.ceil(total / limit) }, data: rows });
  });

  router.get("/movimientos/:id", async (req: Request, res: Response) => {
    res.json({ data: await service.get(req.params.id) });
  });

  router.post("/movimientos", async (req: Request, res: Response) => {
    res.status(201).json({ data: await service.create(req.body) });
  });

  router.patch("/movimientos/:id", async (req: Request, res: Response) => {
    res.json({ data: await service.updateDescription(req.params.id, req.body) });
  });

  router.delete("/movimientos/:id", async (req: Request, res: Response) => {
    await service.cancel(req.params.id);
    res.json({});
  });

  router.get("/billeteras/:asistenteId/saldo", async (req: Request, res: Response) => {
    res.json({ data: await service.balance(req.params.asistenteId) });
  });

  return router;
};

const invalid = (message: string): DomainError => new DomainError("VALIDATION", message);
