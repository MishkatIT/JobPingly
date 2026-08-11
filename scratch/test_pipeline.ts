import { ApiDetectorsAdapter } from '../packages/scraper/src/adapters/apiDetectors';
import fetch from 'node-fetch';

async function testApiDetector() {
  const url = 'https://www.konasl.com/careers#openings';
  const cleanUrl = url.split('#')[0];
  const res = await fetch(cleanUrl);
  const html = await res.text();

  console.log('Testing ApiDetectorsAdapter.detect():', ApiDetectorsAdapter.detect(url, html));

  const jobs = await ApiDetectorsAdapter.extractJobs(url, html);
  console.log(`\nJobs extracted (${jobs.length}):`);
  console.log(JSON.stringify(jobs, null, 2));
}

testApiDetector().catch(console.error);
