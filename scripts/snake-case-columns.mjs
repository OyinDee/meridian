/**
 * Makes every database column snake_case.
 *
 * The schema mixes `@map("snake_case")` with bare camelCase field names, which is
 * fine for Prisma but a trap for hand-written SQL: `transfers.amountMinor` next to
 * `journal_transactions.amount_minor` is exactly the kind of inconsistency that
 * turns a reconciliation query into a 3am incident.
 *
 * The field names in TypeScript stay camelCase; only the physical column changes.
 *
 * Usage: node scripts/snake-case-columns.mjs [--check]
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const schemaPath = path.resolve(process.argv[2] ?? 'apps/api/prisma/schema.prisma');
const checkOnly = process.argv.includes('--check');

const snake = (value) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

const source = await readFile(schemaPath, 'utf8');
const lines = source.split(/\r?\n/);

const modelNames = new Set(
  lines.map((line) => /^model\s+(\w+)\s*\{/.exec(line)?.[1]).filter(Boolean),
);

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

  // Field lines are exactly two spaces in, `name Type`, and never `@@` blocks.
  const field = /^(\s{2})(\w+)(\s+)(\S+)(.*)$/.exec(line);
  if (!inModel || !field || line.trimStart().startsWith('@@')) {
    output.push(line);
    continue;
  }

  const [, indent, name, gap, rawType, rest] = field;
  const type = rawType.replace(/[?[\]]/g, '');
  // Relation fields are virtual in Prisma and must not carry @map.
  if (modelNames.has(type)) {
    output.push(line);
    continue;
  }

  if (rest.includes('@map(') || rest.includes('@relation(')) {
    output.push(line);
    continue;
  }

  const column = snake(name);
  if (column === name) {
    output.push(line);
    continue;
  }

  // Keep any trailing comment in place, insert the mapping before it.
  const commentIndex = rest.indexOf('///');
  const attributes = commentIndex === -1 ? rest : rest.slice(0, commentIndex);
  const comment = commentIndex === -1 ? '' : ` ${rest.slice(commentIndex)}`;
  const next = `${indent}${name}${gap}${rawType}${attributes.trimEnd()} @map("${column}")${comment}`;

  changed += 1;
  output.push(next);
}

const result = output.join('\n');

if (checkOnly) {
  console.log(changed === 0 ? 'ok: every column is snake_case' : `drift: ${changed} column(s) need @map`);
  process.exit(changed === 0 ? 0 : 1);
}

await writeFile(schemaPath, result, 'utf8');
console.log(`added @map to ${changed} column(s) in ${path.relative(process.cwd(), schemaPath)}`);
