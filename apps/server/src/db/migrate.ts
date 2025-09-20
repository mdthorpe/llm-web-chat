import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';

const sqlite = new Database('llm-web-chat.sqlite');
const dir = join(process.cwd(), 'drizzle');
const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

for (const f of files) {
  const sql = readFileSync(join(dir, f), 'utf8');
  try {
    sqlite.exec(sql);
    console.log(`Applied ${f}`);
  } catch (err) {
    const msg = String(err);
    // Skip re-applying objects that already exist
    if (msg.includes('already exists')) {
      console.log(`Skipping ${f} (already applied)`);
      continue;
    }
    throw err;
  }
}

console.log('Migrations applied.');