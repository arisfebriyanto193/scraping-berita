/**
 * kompas.js - Realtime scraper untuk Kompas.com
 * Target: https://www.kompas.com/nasional/
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.kompas.com';
const DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '500');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
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
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
    },
    timeout: 20000,
  });
  return cheerio.load(res.data);
}

async function parseArticle(url) {
  try {
    const $ = await fetchPage(url);

    const title = $('h1.read__title, h1').first().text().trim();

    let content = '';
    const contentEl = $('div.read__content, div[itemprop="articleBody"], article').first();
    contentEl.find('script, style, figure, aside, .ads, .baca-juga').remove();
    content = contentEl.text().replace(/\s+/g, ' ').trim();

    const dateText = $('div.read__time, [itemprop="datePublished"]').first().attr('content')
      || $('div.read__time').first().text();
    let published_date = null;
    if (dateText) {
      const d = new Date(dateText);
      published_date = isNaN(d.getTime()) ? null : d.toISOString();
    }

    const author = $('[itemprop="author"], .credit-title-name').first().text().trim() || null;
    const image_url = $('meta[property="og:image"]').attr('content') || null;

    if (!title || title.length < 10 || !content || content.length < 100) return null;

    return {
      title,
      content,
      url,
      source: 'kompas',
      published_date,
      author,
      image_url,
      category: 'nasional',
    };
  } catch (err) {
    console.error(`[Kompas] Error parse ${url}:`, err.message);
    return null;
  }
}

export async function scrapeKompas(query, maxArticles = 5) {
  try {
    let urls = [];
    
    if (query) {
      const searchUrl = `https://news.google.com/rss/search?q=site:kompas.com+${encodeURIComponent(query)}&hl=id&gl=ID&ceid=ID:id`;
      console.log(`[Kompas] Scraping via GNews: ${searchUrl}`);
      
      const res = await axios.get(searchUrl, { timeout: 20000 });
      const $xml = cheerio.load(res.data, { xmlMode: true });
      
      $xml('item link').each((_, el) => {
        urls.push($xml(el).text());
      });
    } else {
      console.log(`[Kompas] Scraping nasional...`);
      const $ = await fetchPage(`https://nasional.kompas.com/`);
      const links = new Set();
      $('a.article__link, .gs-title a, h2 a[href], h3 a[href], .trending__title a, a.news-link').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.startsWith('http') && href.includes('kompas.com') && href.includes('/read/')) {
          links.add(href);
        }
      });
      urls = [...links];
    }

    urls = urls.slice(0, maxArticles * 2);
    console.log(`[Kompas] URLs found to parse: ${urls.length}`);
    const articles = [];

    for (const url of urls) {
      if (articles.length >= maxArticles) break;
      const art = await parseArticle(url);
      if (art) {
        articles.push(art);
        console.log(`[Kompas] ✅ ${art.title.substring(0, 60)}`);
      }
    }

    console.log(`[Kompas] Total: ${articles.length} artikel`);
    return articles;
  } catch (err) {
    console.error('[Kompas] Scraping gagal:', err.message);
    return [];
  }
}
