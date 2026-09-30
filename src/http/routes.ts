import { Router, type Request, type Response } from "express";

import type { MovementFilter } from "../application/ports/wallet-repository.js";
import { WalletService } from "../application/wallet-service.js";
import { DomainError, MOVEMENT_TYPES, type MovementType } from "../domain/wallet.js";
import { positiveInt } from "./dto.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

interface Listing {
  readonly filter: MovementFilter;
  readonly currentPage: number;
  readonly limit: number;
}

/** Defaults, upper bound and filter validation in one place, shared by the count and the page. */
const listing = (query: Request["query"]): Listing => {
  const currentPage = positiveInt(query.page ?? DEFAULT_LIMIT, "page");
  const limit = positiveInt(query.limit ?? DEFAULT_LIMIT, "limit");
  if (limit > MAX_LIMIT) {
    throw invalid(`limit must be at most ${MAX_LIMIT}`);
  }
  const { asistente_id, tipo } = query;
  if (tipo !== undefined && !isMovementType(tipo)) {
    throw invalid("tipo must be RECARGA or CONSUMO");
  }
  return {
    filter: {
      page: { limit, offset: (currentPage - 1) * limit },
      ...(asistente_id === undefined ? {} : { attendeeId: positiveInt(asistente_id, "asistente_id") }),
      ...(tipo === undefined ? {} : { type: tipo }),
    },
    currentPage,
    limit,
  };
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
    res.json({ message: "movement removed" });
  });

  router.get("/billeteras/:asistenteId/saldo", async (req: Request, res: Response) => {
    res.json({ data: await service.balance(req.params.asistenteId) });
  });

  return router;
};

const isMovementType = (value: unknown): value is MovementType =>
  typeof value === "string" && (MOVEMENT_TYPES as readonly string[]).includes(value);

const invalid = (message: string): DomainError => new DomainError("VALIDATION", message);
