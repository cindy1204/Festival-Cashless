# Marathon Kit — Festival Picnic 2026

Everything you need to build your module.

| Folder | Contains |
|---|---|
| `contratos/` | [Common conventions](contratos/CONVENCIONES.md) and the contract for each module |
| `pruebas/` | The runner and the **public tests** for each module |

## 1. Start the project (15 minutes)

This follows the class project structure (`desarrollo-web-backend`): Express + TypeScript + Prisma, four layers.

```bash
mkdir festival-<module> && cd festival-<module>
git init
npm init -y
npm install express cors dotenv @prisma/client @prisma/adapter-pg pg
npm install -D typescript tsx nodemon prisma @types/express @types/cors @types/node @types/pg
npx prisma init
npm pkg set type=module
```

In `.env`, add the database connection string provided by the instructor, and create `.env.example` without the password:

```
DATABASE_URL="postgresql://..."
PORT=3000
```

In `package.json`, add the scripts (same as the class):

```json
"dev": "nodemon --ext ts,json --exec 'tsx ./src/app.ts'",
"sync": "npx prisma db pull && npx prisma generate"
```

Bring in the shared database schema:

```bash
npm run sync
```

`db pull` shows a warning about *check constraints* that Prisma does not support: this is normal, ignore it. You should see 23 models in `prisma/schema.prisma`.

> ⚠️ **Never** run `npx prisma migrate` or `npx prisma db push`: the database is shared and you could delete other teams' tables.

## 2. Run the tests

With your API running, from the kit folder:

```bash
node pruebas/correr.mjs <module> http://localhost:3000
```

Example:

```bash
node pruebas/correr.mjs boleteria http://localhost:3000
```

Each failing test tells you which request it made and what your API responded. You only need Node 18 or higher; the runner does not install anything.

The tests create records and delete them at the end, so you can run them as many times as you want.

## 3. Hidden tests

The instructor has a second set of tests that **is not in this kit**: edge cases around validation and business rules. Everything they evaluate is written in your contract and conventions. If your API fulfills the full contract, not just the public tests, it will pass.
