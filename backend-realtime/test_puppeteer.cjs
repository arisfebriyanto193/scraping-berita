const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('request', request => {
    if (request.url().includes('search') || request.url().includes('api')) {
      console.log('Request:', request.url());
    }
  });
  await page.goto('https://www.tempo.co/search?q=jokowi', { waitUntil: 'networkidle2' });
  await browser.close();
})();
