import fetch from 'node-fetch';

async function testApiJobs() {
  const url = 'https://www.konasl.com/api/jobs';
  console.log('Fetching:', url);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) JobPinglyBot/1.0',
      'Accept': 'application/json, text/plain, */*',
    },
  });
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('JSON Data:', JSON.stringify(data, null, 2));
}

testApiJobs().catch(console.error);
