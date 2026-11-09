// Small maintenance helper: print selected Prisma models from the schema.
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../apps/api/prisma/schema.prisma', import.meta.url), 'utf8');
const wanted = process.argv.slice(2);
for (const name of wanted) {
  const start = schema.indexOf(`model ${name} {`);
  if (start === -1) {
    console.log(`model ${name}: NOT FOUND`);
    continue;
  }
  const end = schema.indexOf('\n}', start);
  console.log(schema.slice(start, end + 2));
  console.log('---');
}
