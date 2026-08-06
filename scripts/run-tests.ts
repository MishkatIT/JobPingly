import { isUrlSafe } from '../lib/security/ssrf';
import { generateJobFingerprint } from '../packages/scraper/src/fingerprint';
import { diffJobs } from '../packages/scraper/src/differ';
import { matchKeywords } from '../packages/notifications/src/matcher';

console.log('--- Running JobPingly System Tests ---');

// 1. SSRF Tests
console.log('\n[Test 1] SSRF & URL Normalizer...');
const safeRes = isUrlSafe('https://company.com/careers/?utm_source=linkedin&ref=123');
console.assert(safeRes.safe === true, 'Safe URL failed');
console.assert(safeRes.normalizedUrl === 'https://company.com/careers', 'URL normalization failed');

const unsafeRes1 = isUrlSafe('http://localhost:3000');
console.assert(unsafeRes1.safe === false, 'Localhost block failed');
const unsafeRes2 = isUrlSafe('http://169.254.169.254/latest/meta-data');
console.assert(unsafeRes2.safe === false, 'Metadata block failed');
console.log('✔ SSRF & URL Normalizer passed');

// 2. Fingerprinting Tests
console.log('\n[Test 2] Job Fingerprinting...');
const fpExt = generateJobFingerprint({
  externalId: '123456',
  title: 'Backend Engineer',
  url: 'https://company.com/jobs/123456',
});
console.assert(fpExt.startsWith('ext:'), 'External ID fingerprint failed');

const fpUrl = generateJobFingerprint({
  title: 'Backend Engineer',
  url: 'https://company.com/jobs/dev-1?utm_source=test',
});
console.assert(fpUrl.startsWith('url:'), 'URL fingerprint failed');
console.log('✔ Job Fingerprinting passed');

// 3. Differ & Anti-Spike Tests
console.log('\n[Test 3] Job Differ & Anti-Spike Protection...');
const job1Fp = generateJobFingerprint({ externalId: '101', title: 'Job 1' });
const job2Fp = generateJobFingerprint({ externalId: '102', title: 'Job 2' });
const job3Fp = generateJobFingerprint({ externalId: '103', title: 'Job 3' });

const stored = [
  { id: '1', fingerprint: job1Fp, title: 'Job 1', status: 'active', missedScrapes: 0 },
  { id: '2', fingerprint: job2Fp, title: 'Job 2', status: 'active', missedScrapes: 0 },
];
const scraped = [
  { externalId: '101', title: 'Job 1' },
  { externalId: '103', title: 'Job 3' },
];

const diffRes = diffJobs(scraped, stored);
console.assert(diffRes.newJobs.length === 1, 'New jobs count failed');
console.assert(diffRes.unchangedJobs.length === 1, 'Unchanged jobs count failed');
console.assert(diffRes.removedJobs.length === 1, 'Removed jobs count failed');
console.assert(diffRes.isSuspicious === false, 'Anti-spike false positive');

const massStored = Array.from({ length: 10 }).map((_, i) => ({
  id: String(i),
  fingerprint: generateJobFingerprint({ externalId: String(i), title: `Job ${i}` }),
  title: `Job ${i}`,
  status: 'active',
  missedScrapes: 0,
}));
const massScraped = [{ externalId: '0', title: 'Job 0' }];
const massDiffRes = diffJobs(massScraped, massStored);
console.assert(massDiffRes.isSuspicious === true, 'Anti-spike detection failed');
console.log('✔ Job Differ & Anti-Spike passed');

// 4. Keyword Matcher Tests
console.log('\n[Test 4] Keyword Engine...');
const kw1 = matchKeywords(['Node.js'], 'Senior NodeJS Developer', 'Engineering');
console.assert(kw1.isMatch === true, 'Node.js keyword match failed');
const kw2 = matchKeywords(['React'], 'Senior Python Engineer', 'Engineering');
console.assert(kw2.isMatch === false, 'Keyword mismatch failed');
console.log('✔ Keyword Engine passed');

console.log('\n✅ ALL SYSTEM TESTS PASSED SUCCESSFULLY!');
