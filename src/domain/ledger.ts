import { DomainError, type MovementType } from "./wallet.js";

/** Money is a whole number of pesos. Fractional or unsafe values are not money. */
export type Money = number;

/** The sign a posting has on the wallet: a recharge credits it, a consumption debits it. */
export type Direction = "credit" | "debit";

/** What the caller asks the wallet to do. */
export type LedgerIntent =
  | { readonly kind: "recharge"; readonly attendeeId: number; readonly amount: Money; readonly description?: string }
  | { readonly kind: "consumption"; readonly attendeeId: number; readonly amount: Money; readonly description?: string }
  | { readonly kind: "reversal"; readonly movementId: number };

/** The entry being reversed, as read under the lock. */
export interface ActiveEntry {
  readonly id: number;
  readonly attendeeId: number;
  readonly type: MovementType;
  readonly amount: Money;
}

/** The facts the decision is allowed to see, all of them read under the same lock. */
export interface WalletSnapshot {
  readonly attendeeId: number;
  readonly balance: Money;
  readonly entry?: ActiveEntry;
}

/**
 * The intermediate representation between a decision and a write. It carries
 * everything persistence needs and nothing it has to guess: the direction and
 * its positive amount, both balances, the entry to insert, and the condition
 * that must still hold when the write lands.
 */
export type Posting = {
  readonly direction: Direction;
  /** Always positive. The direction carries the sign. */
  readonly amount: Money;
  readonly attendeeId: number;
  readonly type: MovementType;
  readonly description?: string;
  readonly balanceBefore: Money;
  readonly balanceAfter: Money;
  /** Set only for a reversal: the entry may be closed while it is still ACTIVE. */
  readonly reverses: { readonly id: number; readonly state: "ACTIVE" } | null;
};

export type Decision = { readonly ok: true; readonly posting: Posting } | { readonly ok: false; readonly error: DomainError };

/**
 * The single write decision of the wallet. An intent plus a snapshot becomes
 * one balanced posting, or the domain error that has to be reported.
 *
 * This is the only place that knows the order of the checks and the only place
 * that decides whether a balance may go negative.
 */
export const post = (intent: LedgerIntent, snapshot: WalletSnapshot): Decision => {
  const projection = intent.kind === "reversal" ? reverse(intent.movementId, snapshot) : record(intent, snapshot);
  if ("error" in projection) {
    return { ok: false, error: projection.error };
  }
  if (!isSound(projection.posting)) {
    // Unreachable through the public paths: the guard exists so that a future
    // change to the projection cannot weaken the invariant silently.
    throw new Error(`ledger produced an unsound posting: ${JSON.stringify(projection.posting)}`);
  }
  return { ok: true, posting: projection.posting };
};

const record = (
  intent: Extract<LedgerIntent, { kind: "recharge" | "consumption" }>,
  snapshot: WalletSnapshot,
): Decision => {
  const direction: Direction = intent.kind === "recharge" ? "credit" : "debit";
  const balanceAfter = snapshot.balance + signed(direction, intent.amount);
  if (balanceAfter < 0) {
    return { ok: false, error: new DomainError("CONFLICT", "insufficient balance") };
  }
  return {
    ok: true,
    posting: {
      direction,
      amount: intent.amount,
      attendeeId: intent.attendeeId,
      type: intent.kind === "recharge" ? "RECARGA" : "CONSUMO",
      ...(intent.description === undefined ? {} : { description: intent.description }),
      balanceBefore: snapshot.balance,
      balanceAfter,
      reverses: null,
    },
  };
};

const reverse = (movementId: number, snapshot: WalletSnapshot): Decision => {
  const entry = snapshot.entry;
  if (!entry) {
    return { ok: false, error: new DomainError("NOT_FOUND", "movement not found") };
  }
  if (entry.attendeeId !== snapshot.attendeeId) {
    // The caller locked one wallet and read another wallet's entry. No request
    // can produce this, so it is a bug rather than a bad request.
    throw new Error(`ledger reversed entry ${entry.id} of attendee ${entry.attendeeId} while holding ${snapshot.attendeeId}`);
  }
  // Closing a recharge gives the money back, closing a consumption takes it again.
  const direction: Direction = entry.type === "RECARGA" ? "debit" : "credit";
  const balanceAfter = snapshot.balance + signed(direction, entry.amount);
  if (balanceAfter < 0) {
    return { ok: false, error: new DomainError("CONFLICT", "canceling the recharge would leave a negative balance") };
  }
  return {
    ok: true,
    posting: {
      direction,
      amount: entry.amount,
      attendeeId: entry.attendeeId,
      type: entry.type,
      balanceBefore: snapshot.balance,
      balanceAfter,
      reverses: { id: entry.id, state: "ACTIVE" },
    },
  };
};

const signed = (direction: Direction, amount: Money): Money => (direction === "credit" ? amount : -amount);

/** The invariants a posting must satisfy to be safe to persist. */
const isSound = (posting: Posting): boolean => {
  const exact = (value: Money) => Number.isSafeInteger(value);
  return (
    exact(posting.amount) &&
    posting.amount > 0 &&
    exact(posting.balanceBefore) &&
    exact(posting.balanceAfter) &&
    posting.balanceAfter >= 0 &&
    posting.balanceAfter === posting.balanceBefore + signed(posting.direction, posting.amount)
  );
};
