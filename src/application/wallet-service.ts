import { compile, type WalletIntent, type WalletSnapshot } from "../domain/compiler.js";
import { DomainError } from "../domain/wallet.js";
import { parseNewMovement, positiveInt, type Movement, type NewMovement } from "../http/dto.js";
import type { MovementFilter, WalletRepository } from "./ports/wallet-repository.js";

const toIntent = (input: NewMovement): WalletIntent =>
  input.tipo === "RECARGA"
    ? { kind: "recharge", attendeeId: input.asistente_id, amount: input.monto, ...pick(input.descripcion) }
    : { kind: "consumption", attendeeId: input.asistente_id, amount: input.monto, ...pick(input.descripcion) };

const pick = (description: string | undefined) => (description === undefined ? {} : { description });

const notFound = (): never => {
  throw new DomainError("NOT_FOUND", "movement not found");
};

/**
 * The single write pipeline: reference, lock, snapshot, decide, persist.
 * Both mutations share it, so the balance invariant cannot be enforced in one
 * path and forgotten in the other.
 */
const transact = async (repo: WalletRepository, intent: WalletIntent, attendeeId: number) => {
  return repo.withLock(attendeeId, async (locked) => {
    const movement = intent.kind === "cancel" ? await locked.movement(intent.movementId) : undefined;
    const snapshot: WalletSnapshot = { balance: await locked.balance(), ...(movement ? { movement } : {}) };

    const decision = compile(intent, snapshot);
    if (!decision.ok) {
      throw decision.error;
    }
    // A null effect means the row stopped being ACTIVE while we waited for the lock.
    return (await locked.apply(decision.plan)) ?? notFound();
  });
};

export class WalletService {
  constructor(private readonly repo: WalletRepository) {}

  async create(body: unknown): Promise<Movement> {
    const input = parseNewMovement(body);
    await this.requireAttendee(input.asistente_id);
    return transact(this.repo, toIntent(input), input.asistente_id);
  }

  /** Resolve the owner before locking, then decide on data read under the lock. */
  async cancel(rawId: string | number): Promise<Movement> {
    const id = positiveInt(rawId, "id");
    const owner = await this.repo.findActive(id);
    if (!owner) {
      throw new DomainError("NOT_FOUND", "movement not found");
    }
    return transact(this.repo, { kind: "cancel", movementId: id }, owner.asistente_id);
  }

  async get(rawId: string | number): Promise<Movement> {
    const movement = await this.repo.findActive(positiveInt(rawId, "id"));
    if (!movement) {
      throw new DomainError("NOT_FOUND", "movement not found");
    }
    return movement;
  }

  async list(filter: MovementFilter): Promise<{ rows: Movement[]; total: number }> {
    return this.repo.list(filter);
  }

  async updateDescription(rawId: string | number, body: unknown): Promise<Movement> {
    const id = positiveInt(rawId, "id");
    const description = descriptionOf(body);
    const movement = await this.repo.updateDescription(id, description);
    if (!movement) {
      throw new DomainError("NOT_FOUND", "movement not found");
    }
    return movement;
  }

  async balance(rawAttendeeId: string | number): Promise<{ asistente_id: number; saldo: number }> {
    const asistente_id = positiveInt(rawAttendeeId, "asistenteId");
    await this.requireAttendee(asistente_id);
    return { asistente_id, saldo: await this.repo.balance(asistente_id) };
  }

  /** Existence is a read of another team's table, never a write. */
  private async requireAttendee(id: number): Promise<void> {
    if (!(await this.repo.attendeeExists(id))) {
      throw new DomainError("NOT_FOUND", "attendee not found");
    }
  }
}

const descriptionOf = (body: unknown): string | null => {
  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  for (const key of Object.keys(raw)) {
    if (key !== "descripcion") {
      throw new DomainError("VALIDATION", `${key} is not editable`);
    }
  }
  if (!("descripcion" in raw)) {
    throw new DomainError("VALIDATION", "descripcion is the only editable field");
  }
  const descripcion = raw.descripcion;
  if (descripcion !== null && typeof descripcion !== "string") {
    throw new DomainError("VALIDATION", "descripcion must be a string or null");
  }
  if (typeof descripcion === "string" && descripcion.length > 200) {
    throw new DomainError("VALIDATION", "descripcion must be at most 200 characters");
  }
  return descripcion;
};
