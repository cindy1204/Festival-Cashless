export const MOVEMENT_TYPES = ["RECARGA", "CONSUMO"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const ACTIVE = "ACTIVE";
export const REMOVED = "REMOVED";

/** Contract limits: a recharge is bounded, a consumption is any positive amount. */
export const RECHARGE_MIN = 10_000;
export const RECHARGE_MAX = 2_000_000;
export const DESCRIPTION_MAX = 200;

/**
 * Every column this service owns is a PostgreSQL `int`. A value the column
 * cannot hold is a bad request, never a driver error, so the range is checked
 * here instead of being discovered by the database as a 500.
 */
export const INT_MAX = 2_147_483_647;

/** The same bound seen from the money: an amount that cannot be stored. */
export const MONEY_MAX = INT_MAX;

export type ErrorCode = "VALIDATION" | "NOT_FOUND" | "CONFLICT";

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

const MOVEMENT_TYPE_SET: ReadonlySet<string> = new Set(MOVEMENT_TYPES);

export const isMovementType = (value: unknown): value is MovementType =>
  typeof value === "string" && MOVEMENT_TYPE_SET.has(value);

/** Whole pesos, positive and persistable in an `int` column. */
export const isMoney = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MONEY_MAX;

export const isDescription = (value: unknown): value is string =>
  typeof value === "string" && value.length <= DESCRIPTION_MAX;
