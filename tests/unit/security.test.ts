import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { canActOnUser, canAssignRole, can, isStaff, permissionsFor } from '@/lib/auth/rbac';
import { validatePassword } from '@/lib/auth/password';
import { createSignedToken, safeEqual, verifySignedToken } from '@/lib/auth/tokens';
import { toCsv } from '@/lib/jobs/tracker';
import { cleanText, escapeHtml, htmlToText, safeUrl } from '@/lib/security/html';
import { assertPublicUrl, checkUrlSyntax, isPrivateAddress, isSafeHref, normalizeCompanyUrl } from '@/lib/security/ssrf';
import { coerceStoredValue, validateSettingValue } from '@/lib/settings/registry';
import { safeNextPath } from '@/lib/auth/respond';

describe('SSRF: URL syntax checks', () => {
  const rejected = [
    'http://localhost:3000/careers',
    'http://127.0.0.1/careers',
    'http://169.254.169.254/latest/meta-data',
    'http://metadata.google.internal/computeMetadata/v1',
    'http://10.1.2.3/jobs',
    'http://172.20.0.1/jobs',
    'http://192.168.1.1/jobs',
    'http://100.64.0.1/jobs',
    'http://0.0.0.0/jobs',
    'http://[::1]/jobs',
    'http://[fd00::1]/jobs',
    'http://[::ffff:127.0.0.1]/jobs',
    'http://2130706433/jobs', // decimal form of 127.0.0.1
    'http://0x7f.0.0.1/jobs', // hex form
    'http://printer.local/jobs',
    'http://intranet/jobs',
    'https://user:pass@example.com/jobs',
    'https://example.com:22/jobs',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'ftp://example.com/jobs',
  ];
  for (const url of rejected) {
    test(`rejects ${url}`, () => assert.equal(checkUrlSyntax(url).safe, false));
  }

  test('accepts public URLs and adds https when missing', () => {
    const result = checkUrlSyntax('boards.greenhouse.io/stripe');
    assert.equal(result.safe, true);
    assert.equal(result.normalizedUrl, 'https://boards.greenhouse.io/stripe');
  });

  test('normalisation strips tracking parameters, fragments and trailing slashes', () => {
    assert.equal(normalizeCompanyUrl('HTTP://Example.COM/careers/?utm_source=x&team=eng&ref=abc#top'), 'https://example.com/careers?team=eng');
    assert.equal(normalizeCompanyUrl('https://example.com/'), 'https://example.com');
  });

  test('private address classification', () => {
    assert.equal(isPrivateAddress('10.0.0.1'), true);
    assert.equal(isPrivateAddress('192.0.2.10'), true);
    assert.equal(isPrivateAddress('8.8.8.8'), false);
    assert.equal(isPrivateAddress('2606:4700::1111'), false);
    assert.equal(isPrivateAddress('fe80::1'), true);
  });
});

describe('SSRF: DNS-based checks', () => {
  test('blocks a public-looking hostname that resolves to a private address', async () => {
    await assert.rejects(assertPublicUrl('https://evil.example.com/jobs', async () => ['169.254.169.254']), /private or internal/);
  });
  test('blocks when any one of several addresses is private', async () => {
    await assert.rejects(assertPublicUrl('https://mixed.example.com', async () => ['93.184.216.34', '10.0.0.1']));
  });
  test('allows a hostname that resolves publicly', async () => {
    assert.deepEqual(await assertPublicUrl('https://example.com/jobs', async () => ['93.184.216.34']), ['93.184.216.34']);
  });
  test('rejects names that do not resolve', async () => {
    await assert.rejects(assertPublicUrl('https://nope.example.com', async () => []), /Could not resolve/);
  });
});

describe('HTML safety', () => {
  test('escapeHtml neutralises markup', () => {
    assert.equal(escapeHtml(`<img src=x onerror="alert('x')">`), '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;');
  });
  test('safeUrl only allows http(s)', () => {
    assert.equal(safeUrl('javascript:alert(1)'), '#');
    assert.equal(safeUrl('https://example.com/a?b=1&c=2'), 'https://example.com/a?b=1&amp;c=2');
  });
  test('isSafeHref', () => {
    assert.equal(isSafeHref('data:text/html,hi'), false);
    assert.equal(isSafeHref('https://example.com'), true);
  });
  test('cleanText strips control and invisible characters', () => {
    assert.equal(cleanText('  Hello​‮  World\n'), 'Hello World');
  });
  test('htmlToText keeps paragraphs and drops scripts', () => {
    assert.equal(htmlToText('<p>One</p><script>evil()</script><ul><li>Two</li></ul>'), 'One\n- Two');
  });
});

describe('Passwords and tokens', () => {
  test('password policy', () => {
    assert.equal(validatePassword('short').valid, false);
    assert.equal(validatePassword('password123').valid, false);
    assert.equal(validatePassword('aaaaaaaaaaaa').valid, false);
    assert.equal(validatePassword('jane.doe@example.com', { email: 'jane.doe@example.com' }).valid, false);
    assert.equal(validatePassword('x'.repeat(73)).valid, false);
    assert.equal(validatePassword('correct horse battery staple').valid, true);
  });
  test('signed tokens round-trip and reject tampering', () => {
    const token = createSignedToken({ uid: 'abc', act: 'unsub' });
    assert.deepEqual(verifySignedToken(token), { uid: 'abc', act: 'unsub' });
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ uid: 'other', act: 'unsub' })).toString('base64url');
    assert.equal(verifySignedToken(`${forged}.${signature}`), null);
    assert.equal(verifySignedToken(`${payload}.${signature}x`), null);
  });
  test('signed tokens expire', () => {
    const token = createSignedToken({ uid: 'abc' }, -1);
    assert.equal(verifySignedToken(token), null);
  });
  test('safeEqual', () => {
    assert.equal(safeEqual('abc', 'abc'), true);
    assert.equal(safeEqual('abc', 'abd'), false);
    assert.equal(safeEqual('abc', 'abcd'), false);
  });
  test('redirect targets must be same-site paths', () => {
    assert.equal(safeNextPath('/dashboard/jobs?view=new'), '/dashboard/jobs?view=new');
    assert.equal(safeNextPath('//evil.example.com'), null);
    assert.equal(safeNextPath('https://evil.example.com'), null);
    assert.equal(safeNextPath('/\\evil.example.com'), null);
    assert.equal(safeNextPath('/login'), null);
  });
});

describe('Role-based access control', () => {
  test('regular users have no admin permissions', () => {
    assert.equal(isStaff('user'), false);
    assert.deepEqual(permissionsFor('user'), []);
    assert.equal(isStaff('unknown-role'), false);
  });
  test('support can read but not change sources', () => {
    assert.equal(can('support', 'sources.read'), true);
    assert.equal(can('support', 'sources.manage'), false);
  });
  test('only the owner changes roles and sensitive settings', () => {
    assert.equal(can('admin', 'users.roles'), false);
    assert.equal(can('admin', 'settings.sensitive'), false);
    assert.equal(can('owner', 'users.roles'), true);
  });
  test('role assignment rules', () => {
    const owner = { id: 'o', role: 'owner' };
    assert.equal(canAssignRole(owner, { id: 'u', role: 'user' }, 'admin').allowed, true);
    assert.equal(canAssignRole(owner, owner, 'user').allowed, false);
    assert.equal(canAssignRole({ id: 'a', role: 'admin' }, { id: 'u', role: 'user' }, 'admin').allowed, false);
  });
  test('staff can only act on lower-ranked accounts', () => {
    assert.equal(canActOnUser({ id: 'm', role: 'moderator' }, { id: 'a', role: 'admin' }), false);
    assert.equal(canActOnUser({ id: 'a', role: 'admin' }, { id: 'u', role: 'user' }), true);
    assert.equal(canActOnUser({ id: 'a', role: 'admin' }, { id: 'a', role: 'admin' }), false);
  });
});

describe('Settings registry', () => {
  test('rejects a boolean for a numeric setting', () => {
    assert.equal(validateSettingValue('email.brevo_daily_limit', true).ok, false);
  });
  test('enforces bounds', () => {
    assert.equal(validateSettingValue('scraper.global_check_interval_minutes', 1).ok, false);
    assert.equal(validateSettingValue('scraper.global_check_interval_minutes', 60).ok, true);
  });
  test('ignores a boolean that an old toggle wrote over a number', () => {
    assert.equal(coerceStoredValue('email.brevo_daily_limit', true), 300);
    assert.equal(coerceStoredValue('email.brevo_daily_limit', 500), 500);
    assert.equal(coerceStoredValue('scraper.enabled', 'false'), false);
  });
});

describe('CSV export', () => {
  test('quotes separators and neutralises spreadsheet formulas', () => {
    const csv = toCsv(['a', 'b'], [['=HYPERLINK("x")', 'one, two']]);
    assert.equal(csv, 'a,b\r\n"\'=HYPERLINK(""x"")","one, two"\r\n');
  });
});
