import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jobpingly';
const client = postgres(connectionString);

async function migrate() {
  console.log('Running migration to add deleted_at column to lists table...');
  try {
    await client`
      ALTER TABLE lists ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `;
    await client`
      CREATE INDEX IF NOT EXISTS lists_deleted_at_idx ON lists (deleted_at);
    `;
    console.log('Migration completed successfully! Column deleted_at and index lists_deleted_at_idx created.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

migrate();
