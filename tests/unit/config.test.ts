import assert from 'node:assert/strict';
import path from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { listMigrationFiles } from '@/lib/db/migrate';
import { LATEST_MIGRATION } from '@/lib/db/schema-version';
import { env } from '@/lib/env';

describe('Schema version', () => {
  test('the worker expects the newest migration file', () => {
    const files = listMigrationFiles(path.join(process.cwd(), 'drizzle'));
    assert.equal(LATEST_MIGRATION, files[files.length - 1], 'update LATEST_MIGRATION in lib/db/schema-version.ts');
  });
});

/**
 * A production process with no mail provider must not treat logged emails as
 * delivered (alerts would be marked sent and silently lost).
 */

const vars = process.env as Record<string, string | undefined>;
const KEYS = ['NODE_ENV', 'BREVO_API_KEY', 'EMAIL_PROVIDER'] as const;
const saved = Object.fromEntries(KEYS.map(key => [key, vars[key]]));

function configure(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) {
    if (values[key] === undefined) delete vars[key];
    else vars[key] = values[key];
  }
}

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete vars[key];
    else vars[key] = saved[key];
  }
});

describe('Email delivery configuration', () => {
  test('production without a provider is not configured', () => {
    configure({ NODE_ENV: 'production' });
    assert.equal(env.email.provider, 'console');
    assert.equal(env.email.deliveryConfigured, false);
  });

  test('choosing the console provider on purpose is respected in production', () => {
    configure({ NODE_ENV: 'production', EMAIL_PROVIDER: 'console' });
    assert.equal(env.email.deliveryConfigured, true);
  });

  test('a Brevo key configures delivery', () => {
    configure({ NODE_ENV: 'production', BREVO_API_KEY: 'test-key' });
    assert.equal(env.email.provider, 'brevo');
    assert.equal(env.email.deliveryConfigured, true);
  });

  test('EMAIL_PROVIDER=brevo without a key is not configured', () => {
    configure({ NODE_ENV: 'production', EMAIL_PROVIDER: 'brevo' });
    assert.equal(env.email.deliveryConfigured, false);
  });

  test('development and tests log emails instead of sending them', () => {
    configure({ NODE_ENV: 'test' });
    assert.equal(env.email.provider, 'console');
    assert.equal(env.email.deliveryConfigured, true);
  });
});
