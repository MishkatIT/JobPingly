import { cleanCareerPageContent } from '@/packages/scraper/src/cleaner';
import { extractJobsWithAI } from '@/packages/scraper/src/aiExtractor';

async function main() {
  const args = process.argv.slice(2);
  const targetUrl = args.find((a) => a.startsWith('http://') || a.startsWith('https://'));

  if (!targetUrl) {
    console.error('Usage: npm run jobs:test -- "https://example.com/careers"');
    process.exit(1);
  }

  const modelName = process.env.OLLAMA_MODEL || 'qwen3.5:cloud';

  console.log(`Career page:\n${targetUrl}\n`);

  // 1. Scrape
  let html = '';
  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    html = await res.text();
    console.log('Scraped:\n✓\n');
  } catch (err: any) {
    console.error(`Scrape failed: ${err.message}`);
    process.exit(1);
  }

  // 2. Clean content
  const cleaned = cleanCareerPageContent(html);
  console.log(`Cleaned content:\n${cleaned.length.toLocaleString()} characters\n`);

  console.log(`Ollama model:\n${modelName}\n`);

  // 3. Send to Ollama & Validate
  try {
    const results = await extractJobsWithAI([
      {
        pageId: 'test-single-url-page',
        sourceUrl: targetUrl,
        content: cleaned,
      },
    ]);

    const extractedJobs = results && results.length > 0 ? results[0].jobs : [];

    console.log('AI extraction:\n✓\n');
    console.log(`Jobs found:\n${extractedJobs.length}\n`);

    console.log('Structured Extracted JSON:');
    console.log(JSON.stringify(extractedJobs, null, 2));

    process.exit(0);
  } catch (err: any) {
    console.error(`AI extraction failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
