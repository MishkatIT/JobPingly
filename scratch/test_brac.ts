import fetch from 'node-fetch';
import { GenericAdapter } from '../packages/scraper/src/adapters/generic';

async function testBracEnrichment() {
  const url = 'https://www.bracits.com/career/';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();

  console.log('--- ENRICHED BRAC IT JOBS ---');
  const jobs = await GenericAdapter.extractJobs(url, html);
  console.log(JSON.stringify(jobs, null, 2));
}

testBracEnrichment().catch(console.error);
