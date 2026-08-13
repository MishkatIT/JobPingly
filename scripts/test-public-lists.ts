import { db } from '../lib/db/client';
import { lists } from '../lib/db/schema';

async function test() {
  console.log('Testing public lists sorting...');
  const res = await fetch('http://localhost:3000/api/public/lists?page=1&limit=5');
  if (res.ok) {
    const json = await res.json();
    console.log('Public lists returned:');
    json.lists.forEach((l: any, i: number) => {
      console.log(`${i+1}. ${l.name} | Followers: ${l.followerCount} | Companies: ${l.companyCount} | Jobs: ${l.jobCount}`);
    });
  } else {
    console.log('Server returned status:', res.status);
  }
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
