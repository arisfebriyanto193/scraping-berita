/**
 * universal.js - Universal Auto-Scraper
 *
 * Mode: Auto — Bisa scrape portal berita apapun dari URL yang diberikan user.
 * Menggunakan @extractus/article-extractor untuk ekstraksi konten otomatis.
 * Fallback ke cheerio untuk parsing link artikel dari halaman listing.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extract } from '@extractus/article-extractor';

const DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '500');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Fetch raw HTML dari URL
 */
async function fetchHtml(url) {
  await sleep(DELAY_MS + Math.random() * 300);
  const res = await axios.get(url, {
    headers: {
      'User-Agent': randomUA(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
      'Referer': 'https://www.google.com/',
    },
    timeout: 20000,
    maxRedirects: 5,
  });
  return res.data;
}

/**
 * Extract artikel dari URL artikel menggunakan @extractus/article-extractor
 */
async function extractArticle(url, sourceName) {
  try {
    const article = await extract(url, {}, {
      headers: {
        'User-Agent': randomUA(),
        'Accept-Language': 'id-ID,id;q=0.9',
      },
    });

    if (!article || !article.title || article.title.length < 10) return null;

    const content = article.content
      ? article.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : '';

    if (content.length < 80) return null;

    return {
      title: article.title.trim(),
      content,
      url,
      source: sourceName,
      published_date: article.published || null,
      author: article.author || null,
      image_url: article.image || null,
      category: 'umum',
    };
  } catch (err) {
    console.error(`[Universal] Extract gagal ${url}:`, err.message);
    return null;
  }
}

/**
 * Kumpulkan link artikel dari halaman portal (listing page)
 * Gunakan cheerio untuk parse semua <a> yang kemungkinan adalah artikel
 */
function extractArticleLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = new Set();

  const baseDomain = new URL(baseUrl).origin;

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    let fullUrl;
    try {
      fullUrl = href.startsWith('http') ? href : new URL(href, baseDomain).href;
    } catch {
      return;
    }

    if (!fullUrl.startsWith(baseDomain) && !fullUrl.includes(new URL(baseUrl).hostname)) return;

    if (fullUrl === baseUrl || fullUrl === baseUrl + '/') return;
    if (fullUrl.includes('#')) return;
    if (/\.(jpg|jpeg|png|gif|svg|pdf|zip|css|js)$/i.test(fullUrl)) return;
    if (/\/(tag|tags|category|kategori|author|penulis|page|search)\//i.test(fullUrl)) return;

    const path = new URL(fullUrl).pathname;
    if (path === '/' || path === '') return;

    const segments = path.split('/').filter(Boolean);
    if (segments.length < 1) return;

    links.add(fullUrl);
  });

  return [...links];
}

/**
 * Deteksi apakah URL adalah halaman artikel tunggal atau halaman listing
 * Heuristik: URL artikel biasanya panjang, punya angka ID, atau path > 2 level
 */
function isLikelySingleArticle(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const segments = path.split('/').filter(Boolean);

    if (/\d{5,}/.test(path)) return true;
    if (/\d{4}\/\d{2}\/\d{2}/.test(path)) return true;
    if (/-[a-z0-9]{6,}$/.test(path)) return true;
    if (segments.length >= 3) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Main: Scrape dari satu URL portal
 * Bisa berupa halaman listing (homepage / kategori) atau artikel langsung
 */
export async function scrapeUniversal(portalUrl, maxArticles = 5, query = '') {
  const results = [];
  const portalName = (() => {
    try {
      return new URL(portalUrl).hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  })();

  console.log(`[Universal] Scraping: ${portalUrl}`);

  try {
    if (isLikelySingleArticle(portalUrl)) {
      const article = await extractArticle(portalUrl, portalName);
      if (article) results.push(article);
      return results;
    }

    const html = await fetchHtml(portalUrl);
    let links = extractArticleLinks(html, portalUrl);

    if (query) {
      const qLower = query.toLowerCase();
      const qWords = qLower.split(/\s+/).filter(w => w.length > 2);
      const scored = links.map(link => {
        const linkLower = link.toLowerCase();
        const score = qWords.reduce((acc, w) => acc + (linkLower.includes(w) ? 1 : 0), 0);
        return { link, score };
      });
      scored.sort((a, b) => b.score - a.score);
      links = scored.map(s => s.link);
    }

    links = links.slice(0, maxArticles * 3);

    console.log(`[Universal] Ditemukan ${links.length} kandidat link dari ${portalName}`);

    for (const url of links) {
      if (results.length >= maxArticles) break;
      await sleep(300);
      const article = await extractArticle(url, portalName);
      if (article) {
        results.push(article);
        console.log(`[Universal] ✅ ${article.title.substring(0, 60)}`);
      }
    }
  } catch (err) {
    console.error(`[Universal] Gagal scrape ${portalUrl}:`, err.message);
  }

  console.log(`[Universal] ${portalName}: ${results.length} artikel berhasil`);
  return results;
}

/**
 * Scrape dari banyak portal URL sekaligus secara paralel
 */
export async function scrapeMultiplePortals(portalUrls, maxPerSource = 5, query = '') {
  const tasks = portalUrls.map(url => scrapeUniversal(url, maxPerSource, query));
  const settled = await Promise.allSettled(tasks);

  let all = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      all = all.concat(result.value);
    } else {
      console.error('[Universal] Portal error:', result.reason?.message);
    }
  }
  return all;
}
