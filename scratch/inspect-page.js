const cheerio = require('cheerio');

async function test() {
  const res = await fetch('https://careers.bsq.ltd/', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('--- ALL LINKS ---');
  $('a').each((i, elem) => {
    console.log(i, 'href:', $(elem).attr('href'), '| text:', $(elem).text().replace(/\s+/g, ' ').trim());
  });
}
test();
