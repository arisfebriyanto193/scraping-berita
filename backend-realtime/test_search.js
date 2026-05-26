import axios from 'axios';
import * as cheerio from 'cheerio';

async function testKompas() {
    const res = await axios.get('https://search.kompas.com/search/?q=harga+sawit&submit=Submit');
    const $ = cheerio.load(res.data);
    const links = [];
    $('.article__link, .gs-title a, h3 a, a.news-link, a').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('kompas.com') && href.includes('/read/')) {
            links.push(href);
        }
    });
    console.log('Kompas links found:', links.length);
    console.log('Kompas:', [...new Set(links)].slice(0, 3));
}

async function testCNN() {
    const res = await axios.get('https://www.cnnindonesia.com/search/?query=harga+sawit');
    const $ = cheerio.load(res.data);
    const links = [];
    $('.list-content a, article a, a').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('cnnindonesia.com') && (href.includes('/ekonomi/') || href.includes('/nasional/'))) {
            links.push(href);
        }
    });
    console.log('CNN links found:', links.length);
    console.log('CNN:', [...new Set(links)].slice(0, 3));
}

async function testTempo() {
    const res = await axios.get('https://www.tempo.co/search?q=harga+sawit');
    const $ = cheerio.load(res.data);
    const links = [];
    $('.card-title a, article a, a').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('tempo.co') && href.includes('/read/')) {
            links.push(href);
        }
    });
    console.log('Tempo links found:', links.length);
    console.log('Tempo:', [...new Set(links)].slice(0, 3));
}

async function main() {
    await testKompas();
    await testCNN();
    await testTempo();
}
main();
