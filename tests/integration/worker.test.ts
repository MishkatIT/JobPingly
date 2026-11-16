import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { client, closeDb } from '@/lib/db/client';
import { LATEST_MIGRATION } from '@/lib/db/schema-version';
import { runCycle } from '@/lib/monitoring/scheduler';
import { resetData } from '../helpers/integration';

before(resetData);
after(() => closeDb());

test('a worker cycle does nothing while the database lacks a migration, then runs once it is applied', async () => {
  const [row] = await client<{ name: string; checksum: string; applied_at: Date; execution_ms: number | null }[]>`
    SELECT name, checksum, applied_at, execution_ms FROM schema_migrations WHERE name = ${LATEST_MIGRATION}
  `;
  assert.ok(row, 'the test database is fully migrated');

  await client`DELETE FROM schema_migrations WHERE name = ${LATEST_MIGRATION}`;
  globalThis.__jpSchemaReady = undefined;
  try {
    const skipped = await runCycle({ mode: 'manual', skipNotifications: true });
    assert.match(skipped.skipped ?? '', new RegExp(LATEST_MIGRATION.replace('.', '\\.')));
    assert.equal(skipped.claimed, 0);
    assert.equal(skipped.error, undefined, 'a skipped cycle is not an error');
  } finally {
    await client`
      INSERT INTO schema_migrations (name, checksum, applied_at, execution_ms)
      VALUES (${row.name}, ${row.checksum}, ${row.applied_at}, ${row.execution_ms})
    `;
    globalThis.__jpSchemaReady = undefined;
  }

  const ran = await runCycle({ mode: 'manual', skipNotifications: true });
  assert.equal(ran.skipped, undefined);
  assert.equal(ran.error, undefined);
});
