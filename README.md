# Meridian

A core-banking demo built to be read as much as run: a real double-entry ledger,
concurrency-correct money movement, payments, interest and loans, an FX desk, a risk
engine, and a React online-banking front end.

See [`docs/`](./docs) for architecture decisions.

## Quick start

```bash
pnpm install            # install the workspace
cp .env.example .env    # local docker-compose defaults work as-is
pnpm infra:up           # postgres :5433, redis :6380, mailhog :8026
pnpm db:migrate         # apply migrations
pnpm db:seed            # demo users + 12 months of transaction history
pnpm dev                # api on :4000 (Swagger at /api/docs), web on :5173
```

`pnpm bootstrap` does all of the above in one go.

## Layout

```
apps/api          NestJS: ledger, payments, risk, auth, jobs, admin
apps/web          React + Vite online banking UI
packages/money    money type (integer minor units), currency registry, finance math
packages/contracts  zod schemas + shared types used by both sides
docs/             architecture decision records and diagrams
infra/            k6 load tests, helper scripts
```

## The parts worth reading

- `apps/api/src/ledger` - the posting engine: balanced-by-construction journal
  transactions, `SELECT ... FOR UPDATE` in id order, idempotent retries, hash-chained
  tamper evidence.
- `packages/money` - integer minor units, exact rational rate math, banker's rounding,
  loss-free allocation, day-count conventions, annuity amortisation.
- `docs/adr` - why each non-obvious decision was made.
