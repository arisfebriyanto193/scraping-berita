const fs = require('fs');
const html = fs.readFileSync('gnews_redirect.html', 'utf8');
console.log(html.substring(0, 500));
const match = html.match(/<a[^>]+href="([^"]+)"/i);
if (match) console.log('Link:', match[1]);
