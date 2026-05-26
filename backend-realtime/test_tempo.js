const axios = require('axios');
const cheerio = require('cheerio');
axios.get('https://www.tempo.co/search?q=jokowi').then(r => {
  const $ = cheerio.load(r.data);
  const scriptContent = $('#__NUXT_DATA__').html();
  const data = JSON.parse(scriptContent);
  console.log(JSON.stringify(data).match(/https:\/\/[\w.-]+\.tempo\.co\/read\/\d+\/[a-z0-9-]+/g)?.slice(0,5));
});
