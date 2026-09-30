import type { ActiveEntry, Money, Posting } from "../../domain/ledger.js";
import type { MovementType } from "../../domain/wallet.js";
import type { Movement } from "../../http/dto.js";

export interface Page {
  readonly limit: number;
  readonly offset: number;
}

export interface MovementFilter {
  readonly page: Page;
  readonly attendeeId?: number;
  /** Narrowed by the domain, so a filter cannot ask for a type that does not exist. */
  readonly type?: MovementType;
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
  movement(id: number): Promise<ActiveEntry | null>;
  /** Executes the effect; a null result means the row is no longer ACTIVE. */
  apply(posting: Posting): Promise<Movement | null>;
}
