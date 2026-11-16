import { client } from './client';

/**
 * The newest migration this code needs. Update it whenever a file is added to
 * drizzle/ (a unit test fails if it does not match the newest file).
 *
 * Checking the database for this one name, instead of reading the migration
 * directory, keeps filesystem access out of the server bundles.
 */
export const LATEST_MIGRATION = '0006_v1_frequency_defaults.sql';

/** True when the database has every migration this code expects. */
export async function schemaIsCurrent(): Promise<boolean> {
  // Two statements: a query naming a missing table fails when it is parsed,
  // whatever a CASE around it would have selected.
  const [tracking] = await client<{ exists: boolean }[]>`SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists`;
  if (!tracking?.exists) return false;
  const [row] = await client<{ current: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = ${LATEST_MIGRATION}) AS current
  `;
  return Boolean(row?.current);
}
