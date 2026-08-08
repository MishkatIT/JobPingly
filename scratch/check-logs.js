const postgres = require('postgres');

async function test() {
  const sql = postgres(process.env.DATABASE_URL);
  try {
    const logs = await sql`SELECT * FROM scrape_logs WHERE career_page_id = '576bebbe-b8d5-4632-83ea-ec563f9d07c4' LIMIT 10`;
    console.log('--- SCRAPE LOGS ---');
    console.log(logs);
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await sql.end();
  }
}
test();
