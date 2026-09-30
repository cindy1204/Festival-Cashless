import type { PrismaClient, Prisma } from "../../generated/prisma/client.js";
import { ACTIVE, REMOVED, type MovementType } from "../../domain/wallet.js";
import type { Movement } from "../../http/dto.js";
import type { LockedWallet, MovementFilter, WalletRepository } from "../../application/ports/wallet-repository.js";
import type { WalletPlan } from "../../domain/compiler.js";

/** Namespaces the advisory lock so this service cannot collide with another module. */
const LOCK_NAMESPACE = 10;

const SELECT = { id: true, asistente_id: true, tipo: true, monto: true, descripcion: true, state: true } as const;
const NOW = () => ({ updated_at: new Date() });

/** One predicate for every active read, so lists, sums and reads by id cannot diverge. */
const ACTIVE_ONLY = { state: ACTIVE } as const;

type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Tx;

export class PrismaWalletRepository implements WalletRepository {
  constructor(private readonly db: PrismaClient) {}

  /** Existence is a key lookup, not a scan: count() would read every row of the table. */
  async attendeeExists(attendeeId: number): Promise<boolean> {
    const found = await this.db.asistentes.findUnique({ where: { id: attendeeId }, select: { id: true } });
    return found !== null;
  }

  /**
   * The lock is taken inside the transaction and released by its commit, so a
   * concurrent writer for the same attendee waits here and only then reads a
   * balance that already includes the other transaction.
   */
  withLock<T>(attendeeId: number, fn: (repo: LockedWallet) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}, ${attendeeId})`;
      return fn(locked(tx, attendeeId));
    });
  }

  balance(attendeeId: number): Promise<number> {
    return balance(this.db, attendeeId);
  }

  findActive(id: number): Promise<Movement | null> {
    return this.db.movimientos.findFirst({ where: { id, ...ACTIVE_ONLY }, select: SELECT }).then(maybeMovement);
  }

  list(filter: MovementFilter): Promise<{ rows: Movement[]; total: number }> {
    const where = {
      ...ACTIVE_ONLY,
      ...(filter.attendeeId === undefined ? {} : { asistente_id: filter.attendeeId }),
      ...(filter.type === undefined ? {} : { tipo: filter.type }),
    };
    return Promise.all([
      this.db.movimientos.findMany({ where, skip: filter.page.offset, take: filter.page.limit, orderBy: { id: "asc" }, select: SELECT }),
      this.db.movimientos.count({ where }),
    ]).then(([rows, total]) => ({ rows: rows.map(movement), total }));
  }

  async updateDescription(id: number, description: string | null): Promise<Movement | null> {
    const rows = await this.db.movimientos.updateManyAndReturn({
      where: { id, ...ACTIVE_ONLY },
      data: { descripcion: description, ...NOW() },
      select: SELECT,
    });
    return maybeMovement(rows[0] ?? null);
  }
}

const locked = (tx: Tx, attendeeId: number): LockedWallet => ({
  balance: () => balance(tx, attendeeId),
  movement: async (id) => {
    const row = await tx.movimientos.findFirst({ where: { id, ...ACTIVE_ONLY }, select: SELECT });
    return row && { id: row.id, attendeeId: row.asistente_id, type: row.tipo as MovementType, amount: row.monto };
  },
  apply: (plan) => applyPlan(tx, plan),
});

const applyPlan = (tx: Tx, plan: WalletPlan): Promise<Movement | null> => {
  if (plan.effect === "insert") {
    const data = { asistente_id: plan.attendeeId, tipo: plan.type, monto: plan.amount, descripcion: plan.description ?? null, state: ACTIVE };
    return tx.movimientos.create({ data, select: SELECT }).then(movement);
  }
  // The state predicate makes the write itself the concurrency check, and the
  // row comes back from the same statement instead of from a second query.
  return tx.movimientos
    .updateManyAndReturn({ where: { id: plan.movementId, ...ACTIVE_ONLY }, data: { state: REMOVED, ...NOW() }, select: SELECT })
    .then((rows) => maybeMovement(rows[0] ?? null));
};

const balance = async (db: Db, attendeeId: number): Promise<number> => {
  const [row] = await db.$queryRaw<{ saldo: bigint }[]>`
    SELECT COALESCE(SUM(monto) FILTER (WHERE tipo = 'RECARGA'), 0) - COALESCE(SUM(monto) FILTER (WHERE tipo = 'CONSUMO'), 0) AS saldo
    FROM movimientos
    WHERE asistente_id = ${attendeeId} AND state = ${ACTIVE}`;
  // SUM(int) comes back as bigint; the conversion is exact inside the int range.
  return Number(row?.saldo ?? 0n);
};

type Row = { id: number; asistente_id: number; tipo: string; monto: number; descripcion: string | null; state: string };

/** The column check constraint allows only RECARGA and CONSUMO, so the cast is safe. */
const movement = (row: Row): Movement => ({
  id: row.id,
  asistente_id: row.asistente_id,
  tipo: row.tipo as MovementType,
  monto: row.monto,
  descripcion: row.descripcion,
  state: row.state,
});

const maybeMovement = (row: Row | null): Movement | null => (row ? movement(row) : null);
