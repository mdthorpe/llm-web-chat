// apps/server/src/db/client.ts
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

const sqlite = new Database('llm-web-chat.sqlite');
export const db = drizzle(sqlite, { schema });