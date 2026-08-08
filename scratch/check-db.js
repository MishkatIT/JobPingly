const postgres = require('postgres');

async function check() {
  const sql = postgres(process.env.DATABASE_URL);
  try {
    const pages = await sql`SELECT * FROM career_pages`;
    console.log('Career pages count:', pages.length);
    for (const p of pages) {
      console.log('Page:', p.id, p.url, 'ats_type:', p.ats_type, 'status:', p.status, 'hash:', p.last_content_hash);
      const jobs = await sql`SELECT id, title, status, fingerprint FROM jobs WHERE career_page_id = ${p.id}`;
      console.log('  Jobs count in DB:', jobs.length);
      for (const j of jobs) {
        console.log('   -', j.id, '|', j.title, '| status:', j.status);
      }
    }
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await sql.end();
  }
}
check();
