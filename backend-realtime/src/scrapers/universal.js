

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
 * Metode utama: ekstrak artikel menggunakan @extractus/article-extractor
 */
async function extractWithLibrary(url, sourceName) {
  try {
    const article = await extract(url, {}, {
      headers: {
        'User-Agent': randomUA(),
        'Accept-Language': 'id-ID,id;q=0.9',
      },
    });

    if (!article || !article.title || article.title.length < 5) return null;

    const content = article.content
      ? article.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : '';

    if (content.length < 50) return null;

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
    console.error(`[Universal] article-extractor gagal untuk ${url}:`, err.message);
    return null;
  }
}

/**
 * Fallback: ekstrak konten mentah dari HTML menggunakan cheerio
 * Mengambil teks dari elemen artikel / konten utama halaman itu sendiri.
 */
function extractWithCheerio(html, url, sourceName) {
  try {
    const $ = cheerio.load(html);

    // Hapus elemen yang tidak relevan
    $('script, style, nav, header, footer, aside, .ads, .advertisement, .sidebar, .comment, .related').remove();

    // Coba ambil judul dari tag yang umum dipakai
    const title =
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('title').text().trim() ||
      '';

    // Coba ambil konten dari elemen artikel yang umum
    const contentSelectors = [
      'article',
      '[class*="article-body"]',
      '[class*="article-content"]',
      '[class*="post-content"]',
      '[class*="entry-content"]',
      '[class*="detail-content"]',
      '[class*="content-body"]',
      '[class*="news-content"]',
      'main',
      '.content',
    ];

    let contentText = '';
    for (const sel of contentSelectors) {
      const el = $(sel).first();
      if (el.length) {
        contentText = el.text().replace(/\s+/g, ' ').trim();
        if (contentText.length > 100) break;
      }
    }

    // Fallback: ambil semua <p> jika tidak ada elemen artikel
    if (contentText.length < 100) {
      contentText = $('p')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(t => t.length > 30)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (!title || contentText.length < 80) return null;

    // Coba ambil gambar utama
    const imageUrl =
      $('meta[property="og:image"]').attr('content') ||
      $('article img').first().attr('src') ||
      null;

    // Coba ambil tanggal publikasi
    const publishedDate =
      $('meta[property="article:published_time"]').attr('content') ||
      $('time[datetime]').first().attr('datetime') ||
      null;

    // Coba ambil penulis
    const author =
      $('meta[name="author"]').attr('content') ||
      $('[class*="author"]').first().text().trim() ||
      null;

    return {
      title,
      content: contentText,
      url,
      source: sourceName,
      published_date: publishedDate,
      author: author || null,
      image_url: imageUrl,
      category: 'umum',
    };
  } catch (err) {
    console.error(`[Universal] Cheerio fallback gagal untuk ${url}:`, err.message);
    return null;
  }
}

/**
 * Ekstrak berita langsung dari URL yang diberikan.
 * Coba article-extractor terlebih dahulu, lalu fallback ke cheerio.
 */
async function extractDirectFromUrl(url, sourceName) {
  console.log(`[Universal] Mengekstrak konten dari: ${url}`);

  // Coba metode utama dulu
  const fromLibrary = await extractWithLibrary(url, sourceName);
  if (fromLibrary) {
    console.log(`[Universal] ✅ (article-extractor) ${fromLibrary.title.substring(0, 70)}`);
    return fromLibrary;
  }

  // Fallback: parse HTML mentah dengan cheerio
  console.log(`[Universal] ⚠️ article-extractor tidak cukup, fallback ke cheerio...`);
  try {
    const html = await fetchHtml(url);
    const fromCheerio = extractWithCheerio(html, url, sourceName);
    if (fromCheerio) {
      console.log(`[Universal] ✅ (cheerio) ${fromCheerio.title.substring(0, 70)}`);
      return fromCheerio;
    }
  } catch (err) {
    console.error(`[Universal] Gagal fetch HTML untuk fallback ${url}:`, err.message);
  }

  console.warn(`[Universal] ❌ Tidak bisa mengekstrak konten dari: ${url}`);
  return null;
}

/**
 * Main: Scrape langsung dari URL yang diberikan.
 * Mengekstrak berita dari halaman tersebut saja — tidak follow sub-link.
 */
export async function scrapeUniversal(portalUrl, maxArticles = 1, query = '') {
  const results = [];
  const portalName = (() => {
    try {
      return new URL(portalUrl).hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  })();

  console.log(`[Universal] Scraping langsung: ${portalUrl}`);

  try {
    const article = await extractDirectFromUrl(portalUrl, portalName);
    if (article) {
      results.push(article);
    }
  } catch (err) {
    console.error(`[Universal] Gagal scrape ${portalUrl}:`, err.message);
  }

  console.log(`[Universal] ${portalName}: ${results.length} artikel berhasil di-ekstrak`);
  return results;
}

/**
 * Scrape dari banyak URL sekaligus secara paralel.
 * Setiap URL di-ekstrak langsung (tidak crawl sub-link).
 */
export async function scrapeMultiplePortals(portalUrls, maxPerSource = 1, query = '') {
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
