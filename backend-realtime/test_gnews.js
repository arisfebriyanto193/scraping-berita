import axios from 'axios';
import * as cheerio from 'cheerio';

async function testGNews() {
    const query = "harga sawit";
    const site = "cnnindonesia.com";
    const rssUrl = `https://news.google.com/rss/search?q=site:${site}+${encodeURIComponent(query)}&hl=id&gl=ID&ceid=ID:id`;
    
    console.log('Fetching', rssUrl);
    const res = await axios.get(rssUrl);
    const $ = cheerio.load(res.data, { xmlMode: true });
    
    const items = $('item').toArray().slice(0, 3);
    for (const item of items) {
        const link = $(item).find('link').text();
        console.log('Found link:', link);
        
        // Try fetching the link
        try {
            const articleRes = await axios.get(link, { maxRedirects: 5 });
            console.log('Final URL:', articleRes.request.res.responseUrl || articleRes.config.url);
        } catch (err) {
            console.error('Error fetching article:', err.message);
        }
    }
}
testGNews();
