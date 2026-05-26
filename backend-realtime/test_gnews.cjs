const axios = require('axios');
const cheerio = require('cheerio');
axios.get('https://news.google.com/rss/search?q=site:tempo.co+jokowi&hl=id&gl=ID&ceid=ID:id').then(r => {
  const $xml = cheerio.load(r.data, { xmlMode: true });
  const links = [];
  $xml('item link').each((_, el) => {
    links.push($xml(el).text());
  });
  console.log("Found links:", links.length);
  console.log(links.slice(0,2));
}).catch(e => console.error(e.message));
