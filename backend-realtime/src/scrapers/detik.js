/**
 * detik.js - Realtime scraper untuk Detik.com
 * Target: https://www.detik.com/terpopuler
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.detik.com';
const DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '500');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
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

function parseDate(text) {
  if (!text) return null;
  try {
    const monthMap = {
      'Jan': 'Jan', 'Feb': 'Feb', 'Mar': 'Mar', 'Apr': 'Apr',
      'Mei': 'May', 'Jun': 'Jun', 'Jul': 'Jul', 'Agu': 'Aug',
      'Sep': 'Sep', 'Okt': 'Oct', 'Nov': 'Nov', 'Des': 'Dec',
    };
    let cleaned = text.replace(/^(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu),\s*/, '');
    cleaned = cleaned.replace(/ WIB| WITA| WIT/g, '');
    for (const [id, en] of Object.entries(monthMap)) {
      cleaned = cleaned.replace(id, en);
    }
    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

async function parseArticle(url) {
  try {
    const $ = await fetchPage(url);

    const title = $('h1.detail__title, h1.title, h1').first().text().trim();

    let content = '';
    const contentEl = $('div.detail__body-text, div.itp_bodycontent, div#detikdetailtext, article').first();
    contentEl.find('script, style, figure, aside, .ads').remove();
    content = contentEl.text().replace(/\s+/g, ' ').trim();

    const dateEl = $('div.detail__date, span.date, time').first();
    const dateText = dateEl.attr('datetime') || dateEl.text();
    const published_date = parseDate(dateText);

    const author = $('div.detail__author, span.author').first().text().trim() || null;
    const image_url = $('meta[property="og:image"]').attr('content') || null;

    if (!title || title.length < 10 || !content || content.length < 100) return null;

    return {
      title,
      content,
      url,
      source: 'detik',
      published_date,
      author,
      image_url,
      category: 'nasional',
    };
  } catch (err) {
    console.error(`[Detik] Error parse ${url}:`, err.message);
    return null;
  }
}

export async function scrapeDetik(query, maxArticles = 5) {
  try {
    const searchUrl = query 
      ? `https://www.detik.com/search/searchall?query=${encodeURIComponent(query)}`
      : `${BASE_URL}/terpopuler`;
      
    console.log(`[Detik] Scraping: ${searchUrl}`);
    const $ = await fetchPage(searchUrl);

    const links = new Set();
    $('article a[href], .list-content__item a[href], h2 a[href], h3 a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.startsWith('http') && href.includes('detik.com') && href.match(/\-\d+/)) {
        links.add(href);
      }
    });

    const urls = [...links].slice(0, maxArticles * 2);
    const articles = [];

    for (const url of urls) {
      if (articles.length >= maxArticles) break;
      const art = await parseArticle(url);
      if (art) {
        articles.push(art);
        console.log(`[Detik] ✅ ${art.title.substring(0, 60)}`);
      }
    }

    console.log(`[Detik] Total: ${articles.length} artikel`);
    return articles;
  } catch (err) {
    console.error('[Detik] Scraping gagal:', err.message);
    return [];
  }
}
