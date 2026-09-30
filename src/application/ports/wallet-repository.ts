import type { ActiveMovement, Money, WalletPlan } from "../../domain/compiler.js";
import type { Movement } from "../../http/dto.js";

export interface Page {
  readonly limit: number;
  readonly offset: number;
}

export interface MovementFilter {
  readonly page: Page;
  readonly attendeeId?: number;
  readonly type?: string;
}

/**
 * The single persistence port of the wallet. Every method that touches the
 * balance runs inside the transaction handed by `withLock`, so the read that
 * decides and the write that persists are one atomic unit.
 */
export interface WalletRepository {
  attendeeExists(attendeeId: number): Promise<boolean>;

  /** Runs `fn` in one transaction holding the per-attendee write lock. */
  withLock<T>(attendeeId: number, fn: (repo: LockedWallet) => Promise<T>): Promise<T>;

  /** Read-only aggregate, evaluated in SQL and never in JavaScript. */
  balance(attendeeId: number): Promise<Money>;

  findActive(id: number): Promise<Movement | null>;
  list(filter: MovementFilter): Promise<{ rows: Movement[]; total: number }>;
  updateDescription(id: number, description: string | null): Promise<Movement | null>;
}

export interface LockedWallet {
  balance(): Promise<Money>;
  movement(id: number): Promise<ActiveMovement | null>;
  /** Executes the effect; a null result means the row is no longer ACTIVE. */
  apply(plan: WalletPlan): Promise<Movement | null>;
}
