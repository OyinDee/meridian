import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const a = await pool.query(
  "select pid, state, wait_event_type, wait_event, left(query, 70) as q, now() - xact_start as xact_age from pg_stat_activity where datname = current_database() order by xact_start nulls last",
);
console.log(a.rows);
const b = await pool.query("select pid, mode, granted, objid from pg_locks where locktype = 'advisory'");
console.log(b.rows);
await pool.end();
