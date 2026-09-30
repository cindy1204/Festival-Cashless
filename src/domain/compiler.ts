import { DomainError, type MovementType } from "./wallet.js";

export type Money = number;

export type WalletIntent =
  | { readonly kind: "recharge"; readonly attendeeId: number; readonly amount: Money; readonly description?: string }
  | { readonly kind: "consumption"; readonly attendeeId: number; readonly amount: Money; readonly description?: string }
  | { readonly kind: "cancel"; readonly movementId: number };

export interface ActiveMovement {
  readonly id: number;
  readonly attendeeId: number;
  readonly type: MovementType;
  readonly amount: Money;
}

export interface WalletSnapshot {
  readonly balance: Money;
  readonly movement?: ActiveMovement;
}

export type WalletPlan =
  | { readonly effect: "insert"; readonly attendeeId: number; readonly type: MovementType; readonly amount: Money; readonly description?: string; readonly balanceAfter: Money }
  | { readonly effect: "remove"; readonly attendeeId: number; readonly movementId: number; readonly balanceAfter: Money };

export type CompileResult = { readonly ok: true; readonly plan: WalletPlan } | { readonly ok: false; readonly error: DomainError };

/**
 * Pure decision function: an intent plus a snapshot read under lock becomes
 * one persistable effect, or the domain error that must be reported. The
 * balance invariant (never negative) is decided here and nowhere else.
 */
export const compile = (intent: WalletIntent, snapshot: WalletSnapshot): CompileResult => {
  if (intent.kind === "cancel") {
    const movement = snapshot.movement;
    if (!movement) {
      return { ok: false, error: new DomainError("NOT_FOUND", "movement not found") };
    }
    const delta = movement.type === "RECARGA" ? -movement.amount : movement.amount;
    const balanceAfter = snapshot.balance + delta;
    if (balanceAfter < 0) {
      return { ok: false, error: new DomainError("CONFLICT", "canceling the recharge would leave a negative balance") };
    }
    return { ok: true, plan: { effect: "remove", attendeeId: movement.attendeeId, movementId: movement.id, balanceAfter } };
  }

  const delta = intent.kind === "recharge" ? intent.amount : -intent.amount;
  const balanceAfter = snapshot.balance + delta;
  if (balanceAfter < 0) {
    return { ok: false, error: new DomainError("CONFLICT", "insufficient balance") };
  }
  return {
    ok: true,
    plan: {
      effect: "insert",
      attendeeId: intent.attendeeId,
      type: intent.kind === "recharge" ? "RECARGA" : "CONSUMO",
      amount: intent.amount,
      ...(intent.description === undefined ? {} : { description: intent.description }),
      balanceAfter,
    },
  };
};

export const typeOf = (intent: WalletIntent): MovementType | null =>
  intent.kind === "recharge" ? "RECARGA" : intent.kind === "consumption" ? "CONSUMO" : null;
