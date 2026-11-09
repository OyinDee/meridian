/**
 * Prints the state of the database: migrations applied, tables, ledger triggers and
 * the two proofs that must always hold (zero imbalance, complete hash chain).
 *
 * Usage: node scripts/db-inspect.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const apiDir = path.join(root, 'apps', 'api');
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
const client = new Client({ connectionString: env.DATABASE_URL, application_name: 'meridian-db-inspect' });
await client.connect();

const show = async (label, sql, params = []) => {
  const { rows } = await client.query(sql, params);
  console.log(`\n${label}`);
  if (rows.length === 0) {
    console.log('  (none)');
    return rows;
  }
  console.table(rows);
  return rows;
};

const migration = await show(
  'Migrations applied',
  `SELECT migration_name, finished_at IS NOT NULL AS applied
     FROM _prisma_migrations ORDER BY started_at`,
);

await show(
  'Tables',
  `SELECT count(*)::int AS tables
     FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
);

await show(
  'Ledger guards in place',
  `SELECT c.relname AS table_name, t.tgname AS trigger_name, t.tgenabled AS enabled
     FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal
      AND c.relname IN ('ledger_entries', 'journal_transactions', 'audit_logs', 'transfers', 'accounts')
    ORDER BY c.relname, t.tgname`,
);

await show(
  'Ledger proofs',
  `SELECT meridian.ledger_imbalance() AS imbalance_minor,
          (SELECT count(*)::int FROM meridian.verify_ledger_chain()) AS chain_breaks,
          (SELECT count(*)::int FROM journal_transactions) AS journals,
          (SELECT count(*)::int FROM ledger_entries) AS legs`,
);

await show('Trial balance', 'SELECT * FROM meridian.trial_balance()');

const drizzle = (await show('Outbox', `SELECT status, count(*)::int AS events FROM outbox_events GROUP BY status`)) && migration;
console.log(`\nMigration ${drizzle.length > 0 ? 'state checked' : 'not applied'}.`);
console.log('Ledger proofs above must read imbalance 0 and chain_breaks 0.');

await client.end();
