-- The `accounts_create_balance` trigger inserts an account_balances row directly,
-- and `updated_at` is a Prisma `@updatedAt` column with no database default. That
-- made every account INSERT fail with a not-null violation (surfaced by Prisma as
-- "Null constraint violation on the fields: (updated_at)"). Give the column a
-- default so the trigger, and any future raw SQL, can omit it. Prisma still
-- overwrites it with an application timestamp on every update.

ALTER TABLE "account_balances"
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
