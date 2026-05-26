const axios = require('axios');
const cheerio = require('cheerio');
axios.get('https://www.tempo.co/search?q=jokowi').then(r => {
  const $ = cheerio.load(r.data);
  const scriptContent = $('#__NUXT_DATA__').html();
  console.log(scriptContent.includes('read'));
  console.log(scriptContent.includes('jokowi'));
});
