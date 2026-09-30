import { DomainError, DESCRIPTION_MAX, isMoney, isMovementType, RECHARGE_MAX, RECHARGE_MIN, type MovementType } from "../domain/wallet.js";

export interface Movement {
  readonly id: number;
  readonly asistente_id: number;
  readonly tipo: MovementType;
  readonly monto: number;
  readonly descripcion: string | null;
  readonly state: string;
}

export interface NewMovement {
  readonly asistente_id: number;
  readonly tipo: MovementType;
  readonly monto: number;
  readonly descripcion?: string;
}

/**
 * One deterministic parser turns an unknown body into a typed movement.
 * Shape, type, enum and range are rejected in that order, before any
 * reference lookup, which is the precedence the contract requires.
 * JSON values stay strict: an integer arrives as an integer, never as text.
 */
export const parseNewMovement = (body: unknown): NewMovement => {
  const raw = asRecord(body);

  const asistente_id = bodyInt(raw.asistente_id, "asistente_id");
  const tipo = raw.tipo;
  if (!isMovementType(tipo)) {
    throw invalid("tipo must be RECARGA or CONSUMO");
  }

  const monto = raw.monto;
  if (!isMoney(monto)) {
    throw invalid("monto must be a positive integer");
  }
  if (tipo === "RECARGA" && (monto < RECHARGE_MIN || monto > RECHARGE_MAX)) {
    throw invalid(`monto must be between ${RECHARGE_MIN} and ${RECHARGE_MAX} for a RECARGA`);
  }

  const descripcion = raw.descripcion;
  if (descripcion === undefined || descripcion === null) {
    return { asistente_id, tipo, monto };
  }
  return { asistente_id, tipo, monto, descripcion: text(descripcion, "descripcion must be a string") };
};

/**
 * The whitelist of a patch. Naming any other key is refused even when the
 * movement exists, and so is a patch that changes nothing.
 */
export const parseDescriptionPatch = (body: unknown): string | null => {
  const raw = asRecord(body);
  const notEditable = Object.keys(raw).find((key) => key !== "descripcion");
  if (notEditable !== undefined) {
    throw invalid(`${notEditable} is not editable`);
  }
  if (!("descripcion" in raw)) {
    throw invalid("descripcion is the only editable field");
  }
  // The column is nullable, but the API does not infer from that a way to erase
  // the text of a posted movement. A description is either text or absent.
  if (raw.descripcion === null) {
    throw invalid("descripcion must be a string");
  }
  return text(raw.descripcion, "descripcion must be a string or null");
};

/** A bounded string, or the reason it is not one. */
const text = (value: unknown, typeError: string): string => {
  if (typeof value !== "string") {
    throw invalid(typeError);
  }
  if (value.length > DESCRIPTION_MAX) {
    throw invalid(`descripcion must be at most ${DESCRIPTION_MAX} characters`);
  }
  return value;
};

/**
 * Route and query values arrive as text, so they are accepted as text, but
 * only as a plain run of digits. Number() would also read 0x10, 1e3 and
 * " 42 " as numbers, and a query parameter has one spelling or none.
 */
export const positiveInt = (value: unknown, field: string): number => {
  if (typeof value === "string" && !DECIMAL.test(value)) {
    return fail(field);
  }
  const parsed = typeof value === "string" ? Number(value) : value;
  return isPositiveInt(parsed) ? parsed : fail(field);
};

/** A JSON body value must already be a number. */
export const bodyInt = (value: unknown, field: string): number => (isPositiveInt(value) ? value : fail(field));

const DECIMAL = /^[0-9]+$/;

const isPositiveInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;

const fail = (field: string): never => {
  throw invalid(`${field} must be a positive integer`);
};

const asRecord = (body: unknown): Record<string, unknown> =>
  typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

const invalid = (message: string): DomainError => new DomainError("VALIDATION", message);
