import assert from "node:assert/strict";


import { DomainError } from "../../src/domain/wallet.js";
import type { ActiveEntry } from "../../src/domain/ledger.js";
import type { Movement } from "../../src/http/dto.js";
import type { LockedWallet, WalletRepository } from "../../src/application/ports/wallet-repository.js";

/**
 * In-memory wallet used to test the use cases without a database.
 *
 * The lock is a real queue, not a no-op. PostgreSQL holds one attendee's
 * writers behind `pg_advisory_xact_lock`, and a fake that let them all through
 * at once would either hide a bug in the service or invent one, because the
 * microtask order alone decides who reads the balance first. A no-op fake made
 * concurrent requests come out in a fixed order that happened to be safe.
 */
export class FakeWalletRepository implements WalletRepository {
  readonly rows = new Map<number, Movement>();
  readonly attendees = new Set<number>([1, 2, 3, 4]);
  locks = 0;
  nextId = 1000;

  /** How many writers are inside a critical section at once, and the most ever seen. */
  inside = 0;
  peak = 0;
  /** How many writers are queued for an attendee, and the most ever seen. */
  queued = 0;
  peakQueued = 0;

  /** The last holder's release, per attendee: that is the queue. */
  private readonly held = new Map<number, Promise<void>>();
  private gate: Promise<void> | undefined;
  private unblock: (() => void) | undefined;

  /** Keeps every writer outside the lock, so a test can line them up first. */
  hold(): void {
    this.gate = new Promise<void>((resolve) => {
      this.unblock = resolve;
    });
  }

  /** Lets the held writers in, all at once. */
  release(): void {
    this.unblock?.();
    this.unblock = undefined;
    this.gate = undefined;
  }

  async attendeeExists(attendeeId: number): Promise<boolean> {
    return this.attendees.has(attendeeId);
  }

  async withLock<T>(attendeeId: number, fn: (repo: LockedWallet) => Promise<T>): Promise<T> {
    if (this.gate !== undefined) {
      this.queued++;
      this.peakQueued = Math.max(this.peakQueued, this.queued);
      try {
        await this.gate;
      } finally {
        this.queued--;
      }
    }
    const previous = this.held.get(attendeeId) ?? Promise.resolve();
    let open: () => void = () => undefined;
    this.held.set(attendeeId, new Promise<void>((resolve) => (open = resolve)));
    await previous;
    this.locks++;
    this.inside++;
    this.peak = Math.max(this.peak, this.inside);
    try {
      return await fn(this.locked(attendeeId));
    } finally {
      this.inside--;
      open();
    }
  }

  async balance(attendeeId: number): Promise<number> {
    return this.total(attendeeId);
  }

  async findActive(id: number): Promise<Movement | null> {
    return this.rows.get(id)?.state === "ACTIVE" ? this.rows.get(id)! : null;
  }

  async list(filter: { page: { limit: number; offset: number }; attendeeId?: number; type?: string }): Promise<{ rows: Movement[]; total: number }> {
    const rows = [...this.rows.values()]
      .filter((row) => row.state === "ACTIVE")
      .filter((row) => filter.attendeeId === undefined || row.asistente_id === filter.attendeeId)
      .filter((row) => filter.type === undefined || row.tipo === filter.type)
      .sort((a, b) => a.id - b.id);
    return { rows: rows.slice(filter.page.offset, filter.page.offset + filter.page.limit), total: rows.length };
  }

  async updateDescription(id: number, description: string | null): Promise<Movement | null> {
    const row = await this.findActive(id);
    if (!row) {
      return null;
    }
    const updated = { ...row, descripcion: description };
    this.rows.set(id, updated);
    return updated;
  }

  seed(asistente_id: number, tipo: "RECARGA" | "CONSUMO", monto: number): Movement {
    const row: Movement = { id: this.nextId++, asistente_id, tipo, monto, descripcion: null, state: "ACTIVE" };
    this.rows.set(row.id, row);
    return row;
  }

  private total(asistente_id: number): number {
    return [...this.rows.values()]
      .filter((row) => row.state === "ACTIVE" && row.asistente_id === asistente_id)
      .reduce((sum, row) => sum + (row.tipo === "RECARGA" ? row.monto : -row.monto), 0);
  }

  private locked(attendeeId: number): LockedWallet {
    return {
      balance: async () => this.total(attendeeId),
      movement: async (id) => {
        const row = await this.findActive(id);
        return row ? this.toActive(row) : null;
      },
      apply: async (posting) => {
        if (posting.reverses !== null) {
          const row = this.rows.get(posting.reverses.id);
          if (!row || row.state !== posting.reverses.state) {
            return null;
          }
          const removed = { ...row, state: "REMOVED" };
          this.rows.set(removed.id, removed);
          return removed;
        }
        const created = this.seed(posting.attendeeId, posting.type, posting.amount);
        if (posting.description !== undefined) {
          this.rows.set(created.id, { ...created, descripcion: posting.description });
        }
        return this.rows.get(created.id)!;
      },
    };
  }

  private toActive(row: Movement): ActiveEntry {
    return { id: row.id, attendeeId: row.asistente_id, type: row.tipo, amount: row.monto };
  }
}

export const codeOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (error) {
    assert(error instanceof DomainError);
    return error.code;
  }
  return assert.fail("expected the use case to reject");
};