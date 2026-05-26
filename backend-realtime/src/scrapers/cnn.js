/**
 * cnn.js - Realtime scraper untuk CNN Indonesia
 * Target: https://www.cnnindonesia.com/nasional
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.cnnindonesia.com';
const DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '500');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
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

    const title = $('h1.title, h1').first().text().trim();

    let content = '';
    const contentEl = $('div.detail-wrap .detail-text, div[data-component="articleBody"], div.content-artikel').first();
    contentEl.find('script, style, figure, aside, .ads').remove();
    content = contentEl.text().replace(/\s+/g, ' ').trim();

    // Fallback content
    if (!content || content.length < 50) {
      $('p').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 30) content += text + ' ';
      });
      content = content.trim();
    }

    const dateText = $('div.date, time').first().attr('datetime') || $('div.date').first().text();
    let published_date = null;
    if (dateText) {
      const d = new Date(dateText);
      published_date = isNaN(d.getTime()) ? null : d.toISOString();
    }

    const author = $('.author_name, .detail-author').first().text().trim() || null;
    const image_url = $('meta[property="og:image"]').attr('content') || null;

    if (!title || title.length < 10 || !content || content.length < 100) return null;

    return {
      title,
      content,
      url,
      source: 'cnn',
      published_date,
      author,
      image_url,
      category: 'nasional',
    };
  } catch (err) {
    console.error(`[CNN] Error parse ${url}:`, err.message);
    return null;
  }
}

export async function scrapeCNN(query, maxArticles = 5) {
  try {
    let urls = [];
    
    if (query) {
      const searchUrl = `https://news.google.com/rss/search?q=site:cnnindonesia.com+${encodeURIComponent(query)}&hl=id&gl=ID&ceid=ID:id`;
      console.log(`[CNN] Scraping via GNews: ${searchUrl}`);
      
      const res = await axios.get(searchUrl, { timeout: 20000 });
      const $xml = cheerio.load(res.data, { xmlMode: true });
      
      $xml('item link').each((_, el) => {
        urls.push($xml(el).text());
      });
    } else {
      console.log(`[CNN] Scraping nasional...`);
      const $ = await fetchPage(`${BASE_URL}/nasional`);
      const links = new Set();
      $('article a[href], .list-content a[href], h2 a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.startsWith('http') && href.includes('cnnindonesia.com') && href.match(/\-\d+/)) {
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
      
      // Axios akan otomatis follow redirect dari Google News ke CNN
      const art = await parseArticle(url);
      if (art) {
        articles.push(art);
        console.log(`[CNN] ✅ ${art.title.substring(0, 60)}`);
      }
    }

    console.log(`[CNN] Total: ${articles.length} artikel`);
    return articles;
  } catch (err) {
    console.error('[CNN] Scraping gagal:', err.message);
    return [];
  }
}
