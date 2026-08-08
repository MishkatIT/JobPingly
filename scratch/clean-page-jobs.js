const postgres = require('postgres');

async function clean() {
  const sql = postgres(process.env.DATABASE_URL);
  try {
    await sql`DELETE FROM jobs WHERE career_page_id = '576bebbe-b8d5-4632-83ea-ec563f9d07c4'`;
    console.log('Cleaned jobs in DB.');
  } finally {
    await sql.end();
  }
}
clean();
