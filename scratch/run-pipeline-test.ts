import { runScraperPipeline } from '../packages/scraper/src/pipeline';

async function test() {
  try {
    console.log('Running scraper pipeline with force: true for https://careers.bsq.ltd/...');
    const result = await runScraperPipeline('576bebbe-b8d5-4632-83ea-ec563f9d07c4', { force: true });
    console.log('Pipeline result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error running pipeline:', err);
  } finally {
    process.exit(0);
  }
}
test();
