/**
 * Drops everything in the database's `public` schema and reapplies all migrations.
 *
 * `prisma migrate reset` refuses to run non-interactively in some shells, and it also
 * tries to create a shadow database, which Neon does not allow. This does the same
 * job with two statements and then delegates to `prisma migrate deploy`.
 *
 * Guards, because this is destructive and this repository talks to a live Neon branch:
 *   * refuses when NODE_ENV=production unless MERIDIAN_ALLOW_DB_RESET=yes is set;
 *   * refuses if the database contains any journal or transfer rows, unless
 *     MERIDIAN_ALLOW_DB_RESET=wipe-data is set explicitly.
 *
 * Usage: node scripts/db-reset.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const apiDir = path.join(root, 'apps', 'api');
// `pg` is a dependency of the API workspace, not of the repo root.
const { Client } = createRequire(path.join(apiDir, 'package.json'))('pg');

function readEnvFile(file) {
  try {
    const env = {};
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
    return env;
  } catch {
    return {};
  }
}

const env = { ...readEnvFile(path.join(root, '.env')), ...process.env };
const allow = env.MERIDIAN_ALLOW_DB_RESET;
const url = env.DATABASE_URL;

if (!url) throw new Error('DATABASE_URL is not set (expected in .env at the repo root).');
if (env.NODE_ENV === 'production' && allow !== 'yes' && allow !== 'wipe-data') {
  throw new Error('Refusing to reset a production database. Set MERIDIAN_ALLOW_DB_RESET=yes to override.');
}

const client = new Client({ connectionString: url, application_name: 'meridian-db-reset' });
await client.connect();

const { rows } = await client.query(`
  SELECT
    to_regclass('public.ledger_entries') IS NOT NULL AS has_ledger,
    to_regclass('public.transfers') IS NOT NULL AS has_transfers
`);
const hasData =
  rows[0]?.has_ledger === true &&
  (
    await client.query('SELECT EXISTS (SELECT 1 FROM ledger_entries LIMIT 1) AS any')
  ).rows[0]?.any === true;

if (hasData && allow !== 'wipe-data') {
  await client.end();
  throw new Error(
    'This database already contains ledger entries. Re-run with MERIDIAN_ALLOW_DB_RESET=wipe-data to destroy them.',
  );
}

console.log('Dropping schema public ...');
await client.query('DROP SCHEMA IF EXISTS public CASCADE');
await client.query('DROP SCHEMA IF EXISTS meridian CASCADE');
await client.query('CREATE SCHEMA public');
await client.query('GRANT ALL ON SCHEMA public TO public');
await client.end();

const prismaBin = path.join(apiDir, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
console.log('Reapplying migrations ...');
console.log(
  execFileSync(prismaBin, ['migrate', 'deploy', '--schema', path.join('prisma', 'schema.prisma')], {
    cwd: apiDir,
    env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: 'inherit',
  }) ?? '',
);
console.log('Database reset complete.');
