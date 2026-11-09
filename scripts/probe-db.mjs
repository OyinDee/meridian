import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const { Client } = createRequire(path.join(root, 'apps', 'api', 'package.json'))('pg');

const env = Object.fromEntries(
  readFileSync(path.join(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')];
    }),
);

const targets = { direct: env.DATABASE_URL, pooled: env.DATABASE_URL_POOLED };

for (const [label, url] of Object.entries(targets)) {
  if (!url) {
    console.log(label, 'not set');
    continue;
  }
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const client = new Client({ connectionString: url, application_name: 'meridian-probe' });
    try {
      await client.connect();
      const { rows } = await client.query(
        "select current_database() as db, now() as ts, (select count(*)::int from information_schema.tables where table_schema = 'public') as tables",
      );
      console.log(label, `attempt ${attempt}`, 'OK', JSON.stringify(rows[0]));
      await client.end();
      break;
    } catch (error) {
      console.log(label, `attempt ${attempt}`, 'FAIL', error.code ?? error.message);
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}
