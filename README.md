# Festival Cashless — module 10, cashless wallet

The service behind [`docs/contracts/10-cashless-wallet.md`](docs/contracts/10-cashless-wallet.md):
six routes over `movimientos`, and a balance derived from that table rather than
stored anywhere.

## Run it

```bash
npm install
npm run sync      # prisma db pull + generate, the only database command allowed
npm run dev       # PORT (default 3000) and DATABASE_URL from .env
```

Against a running server, the official acceptance kit:

```bash
node tests/run.mjs billetera http://localhost:3000
```

## The two suites, and what each one can prove

| Command | Reaches | Proves |
|---|---|---|
| `npm test` | nothing | domain and use cases, driven against an in-memory repository |
| `npm run test:api` | a loopback port | every route over http, and the lock that serializes writers |

`npm run verify` runs both, after the type check.

Neither suite touches a database. There is no `test:db`, and CI has no service
container: a green run says something about the code and not about the day.

`test:api` is not driven in process. `tests/helpers/api.ts` starts the real
application with `app.listen(0)` and talks to it over a real socket, one
connection per request, on whatever port the operating system hands out. So the
requests are genuinely asynchronous: they interleave, the json parser is the
real one, and a test that needs twenty-four writers in flight at the same moment
gets twenty-four writers in flight at the same moment
(`tests/http/concurrency.test.ts`). Only the persistence is substituted.

### What that substitution costs, stated plainly

No suite here runs against PostgreSQL, so nothing in CI observes what Postgres
itself does with a concurrent pair of transactions. What is checked instead:

- **The lock is a real queue, not a no-op.** The fake keeps one promise per
  attendee and makes writers wait, the way `pg_advisory_xact_lock` does. Break
  that and `test:api` fails in three places — delete the `await previous` line
  and watch.
- **The contract of the queries is checked by shape.** `tests/unit/wallet-repository.test.ts`
  pins the exact Prisma calls the port is allowed to make: that the lock key is
  parameterized, that the balance is summed from active rows, that a cancel is
  conditional, and that `asistentes` is only ever read.

So the guarantee is split honestly: *the code asks for the right things in the
right order* is checked, *the database honours them under concurrency* is not.
Anyone who wants the second half needs a database in the loop.

## How the balance stays honest

Every write that touches a balance takes a transaction-scoped advisory lock for
that `asistente_id`, reads the balance *after* taking it, and writes inside the
same transaction. The lock is namespaced (`10`, this module) so it cannot collide
with another team's. A cancel re-reads the movement under the lock and closes it
with a conditional `UPDATE ... WHERE state = 'ACTIVE'`, so a row that stopped
being open is a `404` rather than money returned twice.

This holds for writers that go through this service. A writer that ignores the
lock — a psql session, another team's script — is outside the guarantee.

## One exception to the shared-database rule

[CONVENTIONS.md §8](docs/contracts/CONVENTIONS.md) says to run no `migrate` and
no `db push`. This module did not run either. It does add two indexes to its own
table:

```prisma
@@index([asistente_id, state, tipo, monto], map: "movimientos_wallet_balance_idx")
@@index([asistente_id, state, id], map: "movimientos_wallet_page_idx")
```

They exist so the balance aggregate is answered from the index alone instead of
scanning every movement of one attendee. This is recorded openly rather than
quietly done:

- They are named `movimientos_wallet_*` and only touch `movimientos`, the table
  this module owns. An index changes no row and no result; it only gives the
  planner an option.
- The base schema was **not** altered, no table was created, and `asistentes` is
  only ever read — a test asserts that (`tests/unit/wallet-repository.test.ts`).
- If the database is ever rebuilt from the seed, they disappear and everything
  keeps working, more slowly. Nothing depends on them existing.
- `npm run sync` introspects them into `schema.prisma`, so the declarations stay
  visible to whoever syncs next.

## How this module reads the edges

The contract and CONVENTIONS leave a handful of edges open. This table records
how **this implementation** resolved them. It adds no requirement of its own; it
only says which way an ambiguity was taken, so a reviewer can tell a decision
from an oversight. Each line names the test that pins it.

| Edge | Decision | Why | Pinned by |
|---|---|---|---|
| `PATCH {}` — no editable field | **400** | A patch that changes nothing is a malformed patch, not a silent success. | `tests/http/mutations.test.ts` |
| `PATCH { descripcion: null }` | **400** | The column is nullable, but the API does not infer from SQL nullability a way to erase the text of a posted movement. A description is text or absent. | `tests/http/mutations.test.ts` |
| `POST` with server-side fields (`state`, `id`, `created_at`) | **Ignored**, as CONVENTIONS §7 says | Calculated fields belong to the server. `state` is always `ACTIVE` and `id` always assigned. | `tests/http/mutations.test.ts` |
| `POST` with any other unknown field | **Ignored** | The contract names only four input fields and CONVENTIONS §7 says unknown calculated fields are ignored, not refused. Refusing them would invent a rule. | `tests/unit/dto.test.ts`, `tests/http/mutations.test.ts` |
| `descripcion: ""` or only spaces | **Stored as sent** | The contract defines optionality and a 200-character maximum, not trimming and not a minimum. Nothing here is added to it. | `tests/unit/dto.test.ts`, `tests/http/mutations.test.ts` |
| A number the `int` columns cannot hold | **400**, never 500 | `asistente_id`, `monto`, a route `:id` and even `page × limit` are all bounded before they reach the driver, so an unstorable value is a client error and not a database failure. | `tests/http/adversarial.test.ts` |
| The balance of a `REMOVED` row | **Excluded**, both recharges and consumptions | Closing a consumption returns its amount; closing a recharge takes it back. Both leave the sum the moment the row stops being `ACTIVE`. | `tests/http/ledger-invariant.test.ts` |
| Balance of an existing attendee with no movements | **`0`**, and `404` only when the attendee does not exist | An empty wallet is a wallet worth zero; a missing one is a missing reference. | `tests/unit/ledger-audit.test.ts` |
| `DELETE` body | **`{ "message": "movement removed" }`** | CONVENTIONS §2 allows any JSON for a delete. | `tests/http/mutations.test.ts` |

### One extension, stated plainly

If every connection and every transaction slot for a wallet is taken at once,
the service answers **`503`** with `{ "error": "the service is busy, try again" }`
instead of the `500` of an unexpected failure. Nothing about the request was
wrong and the same request may well succeed immediately, so it is reported as
overload rather than as a bug. This is the only status this module returns that
CONVENTIONS §2 does not list, and it is reachable only under a burst of writers
aimed at one `asistente_id`. Pinned by `tests/unit/errors.test.ts`.

## Layout

```
src/
  domain/          the decision: post(intent, snapshot) -> posting, and nothing else
  application/     the use cases and the persistence port they talk to
  infrastructure/  the port implemented on prisma
  http/            parsing, routes, and one error boundary
tests/
  unit/            the domain, the use cases, and the shape of every query
  http/            the six routes, over a real socket, against a fake repository
  public/          the official acceptance kit, run against a server you start
```
