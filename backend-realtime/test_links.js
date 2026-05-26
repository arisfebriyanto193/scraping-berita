import axios from 'axios';
import * as cheerio from 'cheerio';

async function testCNN() {
  const cnn = await axios.get('https://www.cnnindonesia.com/search?query=jokowi', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(cnn.data);
  const links = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.includes('jokowi')) links.push(href);
  });
  console.log('CNN found:', links.slice(0,3));
}

async function testTempo() {
  const tempo = await axios.get('https://www.tempo.co/search?q=jokowi', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(tempo.data);
  const links = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.includes('jokowi')) links.push(href);
  });
  console.log('Tempo found:', links.slice(0,3));
}
testCNN();
testTempo();
