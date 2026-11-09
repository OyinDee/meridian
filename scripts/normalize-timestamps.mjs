/**
 * Makes every timestamp timezone-aware (`timestamptz`).
 *
 * Prisma's default `DateTime` maps to Postgres `timestamp(3)` with no timezone, which
 * is the wrong type for a bank: `booked_at`, `settled_at` and `created_at` must mean
 * one instant no matter which server or driver reads them. A `timestamp` column plus
 * a driver that assumes local time is how audit trails end up an hour wrong after a
 * DST or deployment-region change.
 *
 * Usage: node scripts/normalize-timestamps.mjs [--check]
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const schemaPath = path.resolve(process.argv[2] ?? 'apps/api/prisma/schema.prisma');
const checkOnly = process.argv.includes('--check');

const source = await readFile(schemaPath, 'utf8');
const lines = source.split(/\r?\n/);

let inModel = false;
let changed = 0;
const output = [];

for (const line of lines) {
  if (/^model\s+\w+\s*\{/.test(line) || /^enum\s+\w+\s*\{/.test(line)) {
    inModel = true;
    output.push(line);
    continue;
  }
  if (line.startsWith('}')) {
    inModel = false;
    output.push(line);
    continue;
  }

  const field = /^(\s{2})(\w+)(\s+)(\S+)(.*)$/.exec(line);
  if (!inModel || !field || line.trimStart().startsWith('@@')) {
    output.push(line);
    continue;
  }

  const [, indent, name, gap, rawType, rest] = field;
  const baseType = rawType.replace(/[?[\]]/g, '');
  if (baseType !== 'DateTime' || rest.includes('@db.')) {
    output.push(line);
    continue;
  }

  // `createdAt`/`updatedAt` are timestamps too: every DateTime is an instant here.
  changed += 1;
  output.push(`${indent}${name}${gap}${rawType}${rest.trimEnd()} @db.Timestamptz(3)`);
}

const result = output.join('\n');

if (checkOnly) {
  console.log(changed === 0 ? 'ok: every DateTime is timestamptz' : `drift: ${changed} DateTime field(s) lack @db.Timestamptz(3)`);
  process.exit(changed === 0 ? 0 : 1);
}

await writeFile(schemaPath, result, 'utf8');
console.log(`tagged ${changed} DateTime field(s) as @db.Timestamptz(3)`);
