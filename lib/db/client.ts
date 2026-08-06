import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jobpingly';

declare global {
  // eslint-disable-next-line no-var
  var _postgresSql: postgres.Sql | undefined;
}

// Preserve connection instance across Next.js HMR hot-reloads in development
const client = globalThis._postgresSql || postgres(connectionString, {
  max: process.env.NODE_ENV === 'production' ? 10 : 3,
  idle_timeout: 10, // Close idle connections after 10 seconds
  connect_timeout: 5, // Fast timeout on initial connection
});

if (process.env.NODE_ENV !== 'production') {
  globalThis._postgresSql = client;
}

export const db = drizzle(client, { schema });
export { client };
