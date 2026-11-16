/**
 * Verifies that the live database matches lib/db/schema.ts.
 *
 *   npm run db:check
 *
 * Exits non-zero when a table or column that the application expects is
 * missing, or when a column's nullability or type family differs. Extra
 * tables/columns in the database are reported but do not fail the check.
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const TYPE_FAMILIES: Record<string, string> = {
  PgUUID: 'uuid',
  PgText: 'text',
  PgBoolean: 'boolean',
  PgInteger: 'integer',
  PgJsonb: 'jsonb',
  PgTimestamp: 'timestamp with time zone',
  PgArray: 'ARRAY',
};

async function main() {
  const postgres = (await import('postgres')).default;
  const { getTableConfig, PgTable } = await import('drizzle-orm/pg-core');
  const { is } = await import('drizzle-orm');
  const schema = await import('../lib/db/schema');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => {} });
  const problems: string[] = [];
  const notes: string[] = [];

  try {
    const rows = await sql<{ table_name: string; column_name: string; data_type: string; is_nullable: string }[]>`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `;
    const live = new Map<string, Map<string, { type: string; nullable: boolean }>>();
    for (const row of rows) {
      if (!live.has(row.table_name)) live.set(row.table_name, new Map());
      live.get(row.table_name)!.set(row.column_name, { type: row.data_type, nullable: row.is_nullable === 'YES' });
    }

    const indexRows = await sql<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
    const liveIndexes = new Set(indexRows.map(r => r.indexname));

    const expectedTables = new Set<string>();
    for (const value of Object.values(schema)) {
      if (!is(value, PgTable)) continue;
      const config = getTableConfig(value);
      expectedTables.add(config.name);
      const liveColumns = live.get(config.name);
      if (!liveColumns) {
        problems.push(`Missing table: ${config.name}`);
        continue;
      }

      for (const column of config.columns) {
        const found = liveColumns.get(column.name);
        if (!found) {
          problems.push(`Missing column: ${config.name}.${column.name}`);
          continue;
        }
        const expectedType = TYPE_FAMILIES[column.columnType];
        if (expectedType && found.type !== expectedType) {
          problems.push(`Type mismatch: ${config.name}.${column.name} is ${found.type}, schema.ts expects ${expectedType}`);
        }
        if (column.notNull && found.nullable) {
          problems.push(`Nullability mismatch: ${config.name}.${column.name} is nullable in the database but NOT NULL in schema.ts`);
        }
      }

      const expectedColumns = new Set(config.columns.map(c => c.name));
      for (const name of liveColumns.keys()) {
        if (!expectedColumns.has(name)) notes.push(`Extra column in database: ${config.name}.${name}`);
      }

      for (const idx of config.indexes) {
        const name = idx.config.name;
        if (name && !liveIndexes.has(name)) problems.push(`Missing index: ${name} on ${config.name}`);
      }
    }

    if (expectedTables.size === 0) problems.push('No tables were found in lib/db/schema.ts; the check could not run.');

    for (const table of live.keys()) {
      if (!expectedTables.has(table) && table !== 'schema_migrations') notes.push(`Extra table in database: ${table}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  for (const note of notes) console.log(`[db:check] note: ${note}`);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`[db:check] ${problem}`);
    console.error(`[db:check] ${problems.length} problem(s). Run "npm run db:migrate".`);
    process.exit(1);
  }
  console.log(`[db:check] OK. Database matches lib/db/schema.ts.`);
}

main().catch(error => {
  console.error('[db:check] Failed:', error.message);
  process.exit(1);
});
