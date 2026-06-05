/**
 * tempo.js - Realtime scraper untuk Tempo.co
 *
 * PERBAIKAN v2 — URL KATEGORI DIVERIFIKASI LANGSUNG DARI TEMPO.CO (Mei 2026):
 *
 * Perubahan struktur URL Tempo yang sudah dikonfirmasi:
 *   /gaya        → MATI (404)
 *   /gaya-hidup  → AKTIF  ✅
 *   /teroka      → AKTIF  ✅  (hiburan/seni/budaya)
 *   /digital     → AKTIF  ✅  (teknologi)
 *   /nasional    → AKTIF  ✅
 *   /ekonomi     → AKTIF  ✅
 *   /olahraga    → AKTIF  ✅
 *   /tag/<kata>  → AKTIF  ✅  (fallback pencarian topik)
 *
 * Strategi pencarian:
 *   1. Scrape halaman kategori langsung jika query = nama kategori
 *   2. Scrape halaman tag (/tag/<query>) — Tempo mendukung tag pages
 *   3. Fallback: scrape multi-kategori relevan berdasarkan keyword map
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// ── Konstanta ──────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.tempo.co/politik';
const DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '600');
const MAX_RETRY = 2;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

// ── URL kategori — diverifikasi Mei 2026 ──────────────────────────────────

const CATEGORY_URLS = {
  // Ekonomi & Bisnis
  ekonomi:        'https://www.tempo.co/ekonomi',
  bisnis:         'https://www.tempo.co/ekonomi',
  keuangan:       'https://www.tempo.co/ekonomi',

  // Nasional & Politik
  nasional:       'https://www.tempo.co/nasional',
  politik:        'https://www.tempo.co/nasional',
  hukum:          'https://www.tempo.co/nasional',

  // Olahraga
  olahraga:       'https://www.tempo.co/olahraga',
  sepakbola:      'https://www.tempo.co/olahraga',
  bola:           'https://www.tempo.co/olahraga',

  // Teknologi / Digital
  teknologi:      'https://www.tempo.co/digital',
  digital:        'https://www.tempo.co/digital',
  tekno:          'https://www.tempo.co/digital',

  // Gaya Hidup — URL BARU: /gaya-hidup (bukan /gaya)
  'gaya hidup':   'https://www.tempo.co/gaya-hidup',
  lifestyle:      'https://www.tempo.co/gaya-hidup',
  gaya:           'https://www.tempo.co/gaya-hidup',

  // Hiburan / Seni / Budaya
  hiburan:        'https://www.tempo.co/teroka',
  teroka:         'https://www.tempo.co/teroka',
  budaya:         'https://www.tempo.co/teroka',
  seni:           'https://www.tempo.co/teroka',
  film:           'https://www.tempo.co/teroka/film',
  musik:          'https://www.tempo.co/teroka/musik',

  // Lainnya
  otomotif:       'https://www.tempo.co/otomotif',
  kesehatan:      'https://www.tempo.co/kesehatan',
  pendidikan:     'https://www.tempo.co/edukasi',
  edukasi:        'https://www.tempo.co/edukasi',
  opini:          'https://www.tempo.co/kolom',
  kolom:          'https://www.tempo.co/kolom',
  internasional:  'https://www.tempo.co/dunia',
  dunia:          'https://www.tempo.co/dunia',
  metro:          'https://www.tempo.co/metro',
  lingkungan:     'https://www.tempo.co/lingkungan',
};

// Path segment → label kategori
const PATH_CATEGORY = {
  ekonomi:      'ekonomi',
  nasional:     'nasional',
  politik:      'nasional',
  olahraga:     'olahraga',
  digital:      'teknologi',
  'gaya-hidup': 'gaya hidup',
  teroka:       'hiburan',
  otomotif:     'otomotif',
  kesehatan:    'kesehatan',
  edukasi:      'pendidikan',
  kolom:        'opini',
  dunia:        'internasional',
  metro:        'metro',
  lingkungan:   'lingkungan',
};

// Keyword → daftar kategori yang relevan
const KEYWORD_CATEGORY_MAP = {
  dolar:        ['ekonomi'],
  rupiah:       ['ekonomi'],
  saham:        ['ekonomi'],
  ihsg:         ['ekonomi'],
  inflasi:      ['ekonomi'],
  pajak:        ['ekonomi', 'nasional'],
  anggaran:     ['ekonomi', 'nasional'],
  pemilu:       ['nasional'],
  presiden:     ['nasional'],
  prabowo:      ['nasional'],
  mahkamah:     ['nasional'],
  korupsi:      ['nasional'],
  kpk:          ['nasional'],
  covid:        ['kesehatan', 'nasional'],
  vaksin:       ['kesehatan'],
  timnas:       ['olahraga'],
  liga:         ['olahraga'],
  ai:           ['teknologi'],
  iphone:       ['teknologi'],
  startup:      ['teknologi', 'ekonomi'],
  fashion:      ['gaya hidup'],
  kuliner:      ['gaya hidup'],
  wisata:       ['gaya hidup'],
  travel:       ['gaya hidup'],
  drakor:       ['hiburan'],
  film:         ['hiburan'],
  musik:        ['hiburan'],
};

// ── Utilitas ───────────────────────────────────────────────────────────────

const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const sleep    = ms => new Promise(r => setTimeout(r, ms));

function categoryFromUrl(url) {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    return PATH_CATEGORY[segments[0]] || segments[0] || 'umum';
  } catch {
    return 'umum';
  }
}

function isTempoArticleUrl(href) {
  if (!href || !href.startsWith('http') || !href.includes('tempo.co')) return false;
  const excludes = ['/tag/', '/topik/', '/search', '/author/', '/login', '/register', '#', '/harian'];
  if (excludes.some(ex => href.includes(ex))) return false;
  try {
    const segments = new URL(href).pathname.split('/').filter(Boolean);
    // Artikel minimal punya 2 segmen path, slug biasanya mengandung angka ID
    return segments.length >= 2 && /\d{4,}/.test(href);
  } catch {
    return false;
  }
}

// ── HTTP fetch dengan retry ────────────────────────────────────────────────

async function fetchPage(url, retries = MAX_RETRY) {
  await sleep(DELAY_MS + Math.random() * 400);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent':      randomUA(),
          'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer':         'https://www.tempo.co/',
        },
        timeout: 25000,
        maxRedirects: 5,
      });
      return cheerio.load(res.data);
    } catch (err) {
      const status = err.response?.status;
      console.warn(`[Tempo] Attempt ${attempt}/${retries} gagal untuk ${url}: ${err.message}`);
      // Jangan retry jika 404 (halaman memang tidak ada)
      if (status === 404) throw new Error(`404 Not Found: ${url}`);
      if (attempt < retries) await sleep(1500 * attempt);
    }
  }
  throw new Error(`Gagal fetch setelah ${retries} percobaan: ${url}`);
}

// ── Parse satu artikel ─────────────────────────────────────────────────────

async function parseArticle(url) {
  try {
    const $ = await fetchPage(url);

    // Judul
    const title =
      $('h1.title').first().text().trim() ||
      $('h1.artikel-title').first().text().trim() ||
      $('h1.detail-title').first().text().trim() ||
      $('h1[itemprop="headline"]').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('h1').first().text().trim();

    // Konten
    const contentSelectors = [
      'div.detail-in',
      'div#isi-konten',
      'div[itemprop="articleBody"]',
      'div.content-detail',
      'div.artikel-konten',
      'div.detail-content',
      'section.content',
      'article',
    ];
    let contentEl = null;
    for (const sel of contentSelectors) {
      if ($(sel).length) { contentEl = $(sel).first(); break; }
    }
    let content = '';
    if (contentEl) {
      contentEl.find('script,style,figure,aside,.ads,.baca-juga,.iklan,iframe,noscript,.recommendation').remove();
      content = contentEl.text().replace(/\s+/g, ' ').trim();
    }
    if (!content || content.length < 80) {
      const parts = [];
      $('article p, div.content p, div.detail p, .body-text p').each((_, el) => {
        const t = $(el).text().trim();
        if (t.length > 30) parts.push(t);
      });
      content = parts.join(' ').trim();
    }

    // Tanggal
    let published_date = null;
    const dateMeta =
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[itemprop="datePublished"]').attr('content') ||
      $('[itemprop="datePublished"]').attr('content') ||
      $('[itemprop="datePublished"]').text().trim() ||
      $('time').first().attr('datetime');
    if (dateMeta) {
      const d = new Date(dateMeta);
      if (!isNaN(d.getTime())) published_date = d.toISOString();
    }
    if (!published_date) {
      const dateText =
        $('span.source').first().text().trim() ||
        $('div.date').first().text().trim() ||
        $('span.date').first().text().trim();
      const MONTHS = {
        Januari:1,Februari:2,Maret:3,April:4,Mei:5,Juni:6,
        Juli:7,Agustus:8,September:9,Oktober:10,November:11,Desember:12,
      };
      const match = dateText?.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
      if (match && MONTHS[match[2]]) {
        published_date = new Date(parseInt(match[3]), MONTHS[match[2]] - 1, parseInt(match[1])).toISOString();
      }
    }

    // Penulis & gambar
    const author =
      $('[itemprop="author"]').first().text().trim() ||
      $('.reporter-name').first().text().trim() ||
      $('meta[name="author"]').attr('content')?.trim() ||
      null;
    const image_url  = $('meta[property="og:image"]').attr('content') || null;
    const description= $('meta[property="og:description"]').attr('content')?.trim() || null;

    if (!title || title.length < 10) return null;
    if (!content || content.length < 80) {
      if (description?.length > 50) {
        return { title, content: description, url, source: 'tempo', published_date, author, image_url, category: categoryFromUrl(url) };
      }
      return null;
    }

    return { title, content, url, source: 'tempo', published_date, author, image_url, category: categoryFromUrl(url) };
  } catch (err) {
    console.error(`[Tempo] Error parse ${url}:`, err.message);
    return null;
  }
}

// ── Kumpulkan URL dari halaman listing ────────────────────────────────────

async function scrapeListingPage(pageUrl) {
  const $ = await fetchPage(pageUrl);
  const links = new Set();
  const selectors = [
    '.card-title a', '.title a', 'h2 a[href]', 'h3 a[href]',
    'article a[href]', '.artikel-title a', '.news-item a',
    'a[href*="tempo.co"]',
  ];
  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr('href');
      if (isTempoArticleUrl(href)) links.add(href.split('?')[0]);
    });
  }
  return [...links];
}

// ── Strategi: tag page ────────────────────────────────────────────────────
// Tempo menyediakan /tag/<keyword> yang lebih reliabel dari search

async function scrapeTagPage(query) {
  // Ubah spasi → tanda hubung, lowercase
  const slug = query.toLowerCase().replace(/\s+/g, '-');
  const tagUrl = `${BASE_URL}/tag/${encodeURIComponent(slug)}`;
  console.log(`[Tempo] Scraping tag page: ${tagUrl}`);
  try {
    return await scrapeListingPage(tagUrl);
  } catch (err) {
    console.warn(`[Tempo] Tag page gagal (${slug}):`, err.message);
    return [];
  }
}

// ── Strategi: search HTML ─────────────────────────────────────────────────

async function scrapeTempoSearch(query) {
  const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(query)}`;
  console.log(`[Tempo] Scraping search: ${searchUrl}`);
  try {
    return await scrapeListingPage(searchUrl);
  } catch (err) {
    console.warn('[Tempo] Search gagal:', err.message);
    return [];
  }
}

// ── Tentukan kategori relevan dari keyword ────────────────────────────────

function guessCategories(query) {
  const q = query.toLowerCase();
  for (const [kw, cats] of Object.entries(KEYWORD_CATEGORY_MAP)) {
    if (q.includes(kw)) return cats;
  }
  return ['nasional', 'ekonomi'];
}

// ── Filter tanggal & keyword ───────────────────────────────────────────────

function filterByDate(articles, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return articles;
  return articles.filter(a => {
    if (!a.published_date) return true;
    const pub = new Date(a.published_date);
    if (dateFrom && pub < new Date(dateFrom)) return false;
    if (dateTo   && pub > new Date(dateTo))   return false;
    return true;
  });
}

// ── Fungsi utama ───────────────────────────────────────────────────────────

/**
 * Scrape artikel dari Tempo.co
 *
 * @param {string}  query        - Kata kunci atau nama kategori
 * @param {number}  maxArticles  - Default 5
 * @param {string}  dateFrom     - ISO date (opsional)
 * @param {string}  dateTo       - ISO date (opsional)
 */
export async function scrapeTempo(query, maxArticles = 5, dateFrom, dateTo) {
  try {
    const qLower = query ? query.toLowerCase().trim() : '';
    let urls = [];

    if (!query) {
      // Tidak ada query → halaman nasional
      console.log('[Tempo] Scraping halaman nasional...');
      urls = await scrapeListingPage(`${BASE_URL}/nasional`);

    } else if (CATEGORY_URLS[qLower] && !dateFrom && !dateTo) {
      // Query cocok persis dengan nama kategori
      console.log(`[Tempo] Scraping kategori: ${CATEGORY_URLS[qLower]}`);
      urls = await scrapeListingPage(CATEGORY_URLS[qLower]);

    } else {
      // Query bebas — coba berurutan sampai dapat hasil

      // Strategi 1: tag page (paling reliabel untuk keyword)
      urls = await scrapeTagPage(query);

      // Strategi 2: search HTML
      if (urls.length === 0) {
        urls = await scrapeTempoSearch(query);
      }

      // Strategi 3: scrape kategori relevan berdasarkan keyword
      if (urls.length === 0) {
        const cats = guessCategories(qLower);
        console.log(`[Tempo] Fallback ke kategori relevan: ${cats.join(', ')}`);
        const results = await Promise.all(
          cats.map(c =>
            scrapeListingPage(CATEGORY_URLS[c] || `${BASE_URL}/${c}`).catch(() => [])
          )
        );
        urls = [...new Set(results.flat())];
      }
    }

    // Dedup & batasi
    urls = [...new Set(urls)].slice(0, maxArticles * 3);
    console.log(`[Tempo] URLs ditemukan: ${urls.length}, mulai parse...`);

    const articles = [];
    for (const url of urls) {
      if (articles.length >= maxArticles) break;
      const art = await parseArticle(url);
      if (art) {
        articles.push(art);
        console.log(`[Tempo] ✅ ${art.title.substring(0, 70)}`);
      }
    }

    // Filter tanggal
    let result = filterByDate(articles, dateFrom, dateTo);

    // Filter keyword (hanya untuk query bebas)
    if (query && !CATEGORY_URLS[qLower]) {
      const keywords = qLower.split(/\s+/);
      const kf = result.filter(a => {
        const text = `${a.title} ${a.content}`.toLowerCase();
        return keywords.some(kw => text.includes(kw));
      });
      if (kf.length > 0) result = kf;
    }

    result = result.slice(0, maxArticles);
    console.log(`[Tempo] Total artikel dikembalikan: ${result.length}`);
    return result;

  } catch (err) {
    console.error('[Tempo] Scraping gagal:', err.message);
    return [];
  }
}