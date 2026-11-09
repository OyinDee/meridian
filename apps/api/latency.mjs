import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const t0 = Date.now();
await pool.query('SELECT 1');
console.log('connect+select', Date.now() - t0, 'ms');
for (let i = 0; i < 5; i += 1) {
  const s = Date.now();
  await pool.query('SELECT id FROM accounts LIMIT 1');
  console.log('select', i, Date.now() - s, 'ms');
}
const s = Date.now();
const c = await pool.connect();
await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
await c.query('SELECT count(*) FROM ledger_entries');
await c.query('COMMIT');
console.log('txn', Date.now() - s, 'ms');
c.release();
await pool.end();
