import { client } from '../lib/db/client';

async function check() {
  try {
    const logs = await client`SELECT id, recipient_email, sender_email, template_type, status, sender_id, created_at FROM sent_email_logs ORDER BY created_at DESC LIMIT 20;`;
    console.log('Current sent_email_logs count:', logs.length);
    console.log(JSON.stringify(logs, null, 2));
  } catch (err: any) {
    console.error('Error querying logs:', err.message);
  } finally {
    process.exit(0);
  }
}

check();
