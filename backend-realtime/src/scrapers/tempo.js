/**
 * tempo.js - Realtime scraper untuk Tempo.co
 * Target: https://www.tempo.co/nasional/
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.tempo.co';
const DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '500');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchPage(url) {
  await new Promise(r => setTimeout(r, DELAY_MS + Math.random() * 300));
  const res = await axios.get(url, {
    headers: {
      'User-Agent': randomUA(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en;q=0.7',
    },
    timeout: 20000,
  });
  return cheerio.load(res.data);
}

async function parseArticle(url) {
  try {
    const $ = await fetchPage(url);

    const title = $('h1.title, h1.artikel-title, h1').first().text().trim();

    let content = '';
    const contentEl = $('div.detail-in, div#isi-konten, div[itemprop="articleBody"]').first();
    contentEl.find('script, style, figure, aside, .ads, .baca-juga').remove();
    content = contentEl.text().replace(/\s+/g, ' ').trim();

    // Fallback: kumpulkan paragraf
    if (!content || content.length < 50) {
      $('div.content p').each((_, el) => {
        const t = $(el).text().trim();
        if (t.length > 30) content += t + ' ';
      });
      content = content.trim();
    }

    const dateText = $('meta[itemprop="datePublished"]').attr('content')
      || $('time').first().attr('datetime')
      || $('span.source').first().text();
    let published_date = null;
    if (dateText) {
      const d = new Date(dateText);
      published_date = isNaN(d.getTime()) ? null : d.toISOString();
    }

    const author = $('[itemprop="author"], .reporter-name').first().text().trim() || null;
    const image_url = $('meta[property="og:image"]').attr('content') || null;

    if (!title || title.length < 10 || !content || content.length < 100) return null;

    return {
      title,
      content,
      url,
      source: 'tempo',
      published_date,
      author,
      image_url,
      category: 'nasional',
    };
  } catch (err) {
    console.error(`[Tempo] Error parse ${url}:`, err.message);
    return null;
  }
}

export async function scrapeTempo(query, maxArticles = 5) {
  try {
    let urls = [];
    
    if (query) {
      const searchUrl = `https://news.google.com/rss/search?q=site:tempo.co+${encodeURIComponent(query)}&hl=id&gl=ID&ceid=ID:id`;
      console.log(`[Tempo] Scraping via GNews: ${searchUrl}`);
      
      const res = await axios.get(searchUrl, { timeout: 20000 });
      const $xml = cheerio.load(res.data, { xmlMode: true });
      
      $xml('item link').each((_, el) => {
        urls.push($xml(el).text());
      });
    } else {
      console.log(`[Tempo] Scraping nasional...`);
      const $ = await fetchPage(`${BASE_URL}/nasional/`);
      const links = new Set();
      $('article a[href], h2 a[href], h3 a[href], .card-title a').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.startsWith('http') && href.includes('tempo.co') && href.includes('/read/')) {
          links.add(href);
        }
      });
      urls = [...links];
    }

    // Hanya ambil secukupnya untuk di-parse
    urls = urls.slice(0, maxArticles * 2);
    const articles = [];

    for (const url of urls) {
      if (articles.length >= maxArticles) break;
      
      const art = await parseArticle(url);
      if (art) {
        articles.push(art);
        console.log(`[Tempo] ✅ ${art.title.substring(0, 60)}`);
      }
    }

    console.log(`[Tempo] Total: ${articles.length} artikel`);
    return articles;
  } catch (err) {
    console.error('[Tempo] Scraping gagal:', err.message);
    return [];
  }
}
