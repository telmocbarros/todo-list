import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from './schema.js';

export type TDatabase = LibSQLDatabase<typeof schema>;

// Same relative depth from src/db and dist/db
const migrationsFolder = fileURLToPath(new URL('../../migrations', import.meta.url));

/** Opens (creating if needed) a SQLite database, enables foreign keys and applies pending migrations. */
export const createDatabase = async (path: string): Promise<{ db: TDatabase; close: () => void }> => {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const client = createClient({ url: path === ':memory:' ? ':memory:' : `file:${path}` });
  await client.execute('PRAGMA foreign_keys = ON');

  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });

  return { db, close: () => client.close() };
};
