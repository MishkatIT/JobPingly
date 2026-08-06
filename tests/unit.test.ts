import { describe, it, expect } from 'vitest';
import { isUrlSafe } from '../lib/security/ssrf';
import { generateJobFingerprint } from '../packages/scraper/src/fingerprint';
import { diffJobs } from '../packages/scraper/src/differ';
import { matchKeywords } from '../packages/notifications/src/matcher';

describe('1. SSRF & URL Normalizer', () => {
  it('should allow valid public HTTPS URLs and strip tracking params', () => {
    const res = isUrlSafe('https://company.com/careers/?utm_source=linkedin&ref=123');
    expect(res.safe).toBe(true);
    expect(res.normalizedUrl).toBe('https://company.com/careers');
  });

  it('should block localhost and private IPs', () => {
    expect(isUrlSafe('http://localhost:3000').safe).toBe(false);
    expect(isUrlSafe('http://127.0.0.1/admin').safe).toBe(false);
    expect(isUrlSafe('http://169.254.169.254/latest/meta-data').safe).toBe(false);
    expect(isUrlSafe('http://10.0.0.1').safe).toBe(false);
  });
});

describe('2. Job Fingerprinting', () => {
  it('should prioritize ATS external job ID', () => {
    const fp = generateJobFingerprint({
      externalId: '123456',
      title: 'Backend Engineer',
      url: 'https://company.com/jobs/123456',
    });
    expect(fp.startsWith('ext:')).toBe(true);
  });

  it('should use normalized URL hash if no external ID exists', () => {
    const fp = generateJobFingerprint({
      title: 'Backend Engineer',
      url: 'https://company.com/jobs/dev-1?utm_source=test',
    });
    expect(fp.startsWith('url:')).toBe(true);
  });
});

describe('3. Job Differ & Anti-Spike Protection', () => {
  it('should classify NEW and UNCHANGED jobs correctly', () => {
    const stored = [
      { id: '1', fingerprint: generateJobFingerprint({ externalId: '101', title: 'Job 1' }), title: 'Job 1', status: 'active', missedScrapes: 0 },
      { id: '2', fingerprint: generateJobFingerprint({ externalId: '102', title: 'Job 2' }), title: 'Job 2', status: 'active', missedScrapes: 0 },
    ];
    const scraped = [
      { externalId: '101', title: 'Job 1' }, // Unchanged
      { externalId: '103', title: 'Job 3' }, // New
    ];

    const result = diffJobs(scraped, stored);
    expect(result.newJobs.length).toBe(1);
    expect(result.unchangedJobs.length).toBe(1);
    expect(result.removedJobs.length).toBe(1);
    expect(result.isSuspicious).toBe(false);
  });

  it('should flag suspicious mass drop when >80% active jobs vanish on 5+ items', () => {
    const stored = Array.from({ length: 10 }).map((_, i) => ({
      id: String(i),
      fingerprint: `ext:${i}`,
      title: `Job ${i}`,
      status: 'active',
      missedScrapes: 0,
    }));
    const scraped = [{ externalId: '0', title: 'Job 0' }]; // 9 out of 10 dropped (90% drop)

    const result = diffJobs(scraped, stored);
    expect(result.isSuspicious).toBe(true);
  });
});

describe('4. Keyword Matcher', () => {
  it('should match Node.js variations deterministically', () => {
    const res1 = matchKeywords(['Node.js'], 'Senior NodeJS Developer', 'Engineering');
    expect(res1.isMatch).toBe(true);

    const res2 = matchKeywords(['React'], 'Senior Python Engineer', 'Engineering');
    expect(res2.isMatch).toBe(false);
  });
});
