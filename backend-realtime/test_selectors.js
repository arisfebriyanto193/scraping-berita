import axios from 'axios';
import * as cheerio from 'cheerio';

async function testCNN() {
  const url = 'https://www.cnnindonesia.com/search?query=jokowi';
  console.log('Fetching', url);
  const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(res.data);
  const links = new Set();
  $('article a[href], .list-content a[href], h2 a[href], .media a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.startsWith('http') && href.includes('cnnindonesia.com') && href.match(/\-\d+/)) {
      links.add(href);
    }
  });
  console.log('CNN Links:', [...links].slice(0, 3));
}

async function testKompas() {
  const url = 'https://search.kompas.com/search?q=jokowi';
  console.log('Fetching', url);
  const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(res.data);
  const links = new Set();
  $('a.article__link, .gs-title a, h2 a[href], h3 a[href], .trending__title a, a.news-link').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.startsWith('http') && href.includes('kompas.com') && href.includes('/read/')) {
      links.add(href);
    }
  });
  console.log('Kompas Links:', [...links].slice(0, 3));
}

async function testTempo() {
  const url = 'https://www.tempo.co/search?q=jokowi';
  console.log('Fetching', url);
  const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(res.data);
  const links = new Set();
  $('article a[href], h2 a[href], h3 a[href], .card-title a, .title a').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.startsWith('http') && href.includes('tempo.co') && href.includes('/read/')) {
      links.add(href);
    }
  });
  console.log('Tempo Links:', [...links].slice(0, 3));
}

async function run() {
  await testCNN();
  await testKompas();
  await testTempo();
}
run();
