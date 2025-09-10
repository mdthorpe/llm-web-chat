// apps/server/src/db/migrate.ts
import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';

const sqlite = new Database('llm-web-chat.sqlite');

// Read the generated SQL file
const sql = readFileSync(join(process.cwd(), 'drizzle', '0000_initial.sql'), 'utf8');

// Execute the SQL
sqlite.exec(sql);
console.log('Migrations applied');