/**
 * kompas.js - Realtime scraper untuk Kompas.com
 *
 * PERBAIKAN UTAMA:
 * 1. Halaman search.kompas.com menggunakan Google Custom Search Engine (CSE)
 *    yang di-render via JavaScript — tidak bisa di-scrape dengan Cheerio.
 *    Solusi: gunakan Google CSE JSON API sebagai fallback, atau scrape
 *    halaman kategori langsung.
 * 2. Selector CSS diperluas & diberi fallback berlapis.
 * 3. Dedup URL antar-query.
 * 4. Retry sederhana pada network error.
 * 5. Filter tanggal dilakukan setelah parse artikel (karena search URL-nya
 *    tidak selalu mendukung parameter tanggal secara reliable).
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// ── Konstanta ──────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.kompas.com';
const DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '600');
const MAX_RETRY = 2;

// Google Custom Search Engine (CSE) untuk Kompas
// Daftarkan project di https://developers.google.com/custom-search/v1/overview
// dan set env var berikut jika ingin menggunakan search berbasis API.
const GOOGLE_API_KEY = process.env.GOOGLE_CSE_API_KEY || '';
const GOOGLE_CX = process.env.GOOGLE_CSE_CX || ''; // cx ID kompas

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
];

// ── URL per kategori ───────────────────────────────────────────────────────

const CATEGORY_URLS = {
  ekonomi:      'https://money.kompas.com',
  bisnis:       'https://money.kompas.com',
  nasional:     'https://nasional.kompas.com',
  politik:      'https://nasional.kompas.com',
  olahraga:     'https://bola.kompas.com',
  bola:         'https://bola.kompas.com',
  teknologi:    'https://tekno.kompas.com',
  tekno:        'https://tekno.kompas.com',
  hiburan:      'https://entertainment.kompas.com',
  entertainment:'https://entertainment.kompas.com',
  'gaya hidup': 'https://lifestyle.kompas.com',
  lifestyle:    'https://lifestyle.kompas.com',
  otomotif:     'https://otomotif.kompas.com',
  kesehatan:    'https://health.kompas.com',
  health:       'https://health.kompas.com',
  pendidikan:   'https://edukasi.kompas.com',
  edukasi:      'https://edukasi.kompas.com',
  opini:        'https://kolom.kompas.com',
  properti:     'https://properti.kompas.com',
  travel:       'https://travel.kompas.com',
  sains:        'https://sains.kompas.com',
  internasional:'https://internasional.kompas.com',
};

// Subdomain → kategori label untuk tag artikel
const SUBDOMAIN_CATEGORY = {
  'money':         'ekonomi',
  'nasional':      'nasional',
  'bola':          'olahraga',
  'tekno':         'teknologi',
  'entertainment': 'hiburan',
  'lifestyle':     'gaya hidup',
  'otomotif':      'otomotif',
  'health':        'kesehatan',
  'edukasi':       'pendidikan',
  'kolom':         'opini',
  'properti':      'properti',
  'travel':        'travel',
  'sains':         'sains',
  'internasional': 'internasional',
};

// ── Utilitas ───────────────────────────────────────────────────────────────

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function categoryFromUrl(url) {
  try {
    const host = new URL(url).hostname; // e.g. money.kompas.com
    const sub = host.split('.')[0];
    return SUBDOMAIN_CATEGORY[sub] || 'umum';
  } catch {
    return 'umum';
  }
}

function isKompasArticleUrl(href) {
  return (
    href &&
    href.startsWith('http') &&
    href.includes('kompas.com') &&
    href.includes('/read/')
  );
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
          'Referer':         'https://www.kompas.com/',
          'Cache-Control':   'no-cache',
        },
        timeout: 25000,
        maxRedirects: 5,
      });
      return cheerio.load(res.data);
    } catch (err) {
      console.warn(`[Kompas] Attempt ${attempt}/${retries} gagal untuk ${url}: ${err.message}`);
      if (attempt < retries) await sleep(1500 * attempt);
    }
  }
  throw new Error(`Gagal fetch setelah ${retries} percobaan: ${url}`);
}

// ── Parse satu artikel ─────────────────────────────────────────────────────

async function parseArticle(url) {
  try {
    const $ = await fetchPage(url);

    // ── Judul ──
    const title =
      $('h1.read__title').first().text().trim() ||
      $('h1.article__title').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('h1').first().text().trim();

    // ── Konten ──
    const contentSelectors = [
      'div.read__content',
      'div[itemprop="articleBody"]',
      'div.article__content',
      'div.detail__body-text',
      'article',
    ];
    let contentEl = null;
    for (const sel of contentSelectors) {
      if ($(sel).length) { contentEl = $(sel).first(); break; }
    }
    let content = '';
    if (contentEl) {
      contentEl.find('script, style, figure, aside, .ads, .baca-juga, .recommendation, iframe, noscript').remove();
      content = contentEl.text().replace(/\s+/g, ' ').trim();
    }

    // ── Tanggal ──
    let published_date = null;
    const dateMeta = $('meta[property="article:published_time"]').attr('content')
      || $('[itemprop="datePublished"]').attr('content')
      || $('[itemprop="datePublished"]').text().trim();

    if (!dateMeta) {
      // Fallback: ambil dari teks elemen tanggal
      const dateText = $('div.read__time').first().text().trim();
      if (dateText) {
        // Format: "Rabu, 28 Mei 2026 | 10:30 WIB" → parsing manual
        const match = dateText.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
        if (match) {
          const MONTHS = {
            Januari:1, Februari:2, Maret:3, April:4, Mei:5, Juni:6,
            Juli:7, Agustus:8, September:9, Oktober:10, November:11, Desember:12,
          };
          const day = parseInt(match[1]);
          const month = MONTHS[match[2]];
          const year = parseInt(match[3]);
          if (month) {
            published_date = new Date(year, month - 1, day).toISOString();
          }
        }
      }
    } else {
      const d = new Date(dateMeta);
      if (!isNaN(d.getTime())) published_date = d.toISOString();
    }

    // ── Penulis ──
    const author =
      $('[itemprop="author"]').first().text().trim() ||
      $('.credit-title-name').first().text().trim() ||
      $('meta[name="author"]').attr('content')?.trim() ||
      null;

    // ── Gambar ──
    const image_url = $('meta[property="og:image"]').attr('content') || null;

    // ── Deskripsi ──
    const description = $('meta[property="og:description"]').attr('content')?.trim() || null;

    // ── Validasi minimal ──
    if (!title || title.length < 10) {
      console.warn(`[Kompas] Skip (judul pendek): ${url}`);
      return null;
    }
    if (!content || content.length < 80) {
      // Coba pakai description sebagai content fallback
      if (description && description.length > 50) {
        return {
          title,
          content: description,
          url,
          source: 'kompas',
          published_date,
          author,
          image_url,
          category: categoryFromUrl(url),
        };
      }
      console.warn(`[Kompas] Skip (konten kosong): ${url}`);
      return null;
    }

    return {
      title,
      content,
      url,
      source: 'kompas',
      published_date,
      author,
      image_url,
      category: categoryFromUrl(url),
    };
  } catch (err) {
    console.error(`[Kompas] Error parse ${url}:`, err.message);
    return null;
  }
}

// ── Strategi 1: Scrape halaman kategori ───────────────────────────────────

async function scrapeCategory(categoryUrl) {
  const $ = await fetchPage(categoryUrl);
  const links = new Set();

  // Selector berlapis — Kompas kerap ganti class
  const selectors = [
    'a.article__link',
    'a[data-content-type="article"]',
    '.latest__title a',
    '.article__asset a',
    'h2 a[href*="/read/"]',
    'h3 a[href*="/read/"]',
    '.trending__title a',
    'a.news-link',
    'a[href*="/read/"]',    // fallback lebar
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr('href');
      if (isKompasArticleUrl(href)) links.add(href.split('?')[0]);
    });
  }
  return [...links];
}

// ── Strategi 2: Google CSE JSON API (opsional) ────────────────────────────

async function searchViaGoogleCSE(query, dateFrom, dateTo) {
  if (!GOOGLE_API_KEY || !GOOGLE_CX) return [];
  try {
    const params = new URLSearchParams({
      key: GOOGLE_API_KEY,
      cx:  GOOGLE_CX,
      q:   query,
      num: '10',
    });
    if (dateFrom && dateTo) {
      // sort=date tidak didukung, tapi bisa filter via dateRestrict
      // params.append('dateRestrict', 'd7'); // 7 hari terakhir
    }
    const res = await axios.get(`https://www.googleapis.com/customsearch/v1?${params}`, { timeout: 10000 });
    const items = res.data?.items || [];
    return items
      .map(i => i.link)
      .filter(isKompasArticleUrl);
  } catch (err) {
    console.warn('[Kompas] Google CSE gagal:', err.message);
    return [];
  }
}

// ── Strategi 3: Scrape search.kompas.com (HTML statis fallback) ───────────
// Catatan: halaman ini menggunakan Google CSE yang di-render via JS,
// sehingga Cheerio tidak akan mendapat hasil. Strategi ini tetap dicoba
// untuk antisipasi jika suatu saat Kompas mengubah implementasinya.

async function scrapeKompasSearch(query, dateFrom, dateTo) {
  let searchUrl = `https://search.kompas.com/search?q=${encodeURIComponent(query)}`;
  if (dateFrom && dateTo) {
    const df = new Date(dateFrom);
    const dt = new Date(dateTo);
    if (!isNaN(df.getTime()) && !isNaN(dt.getTime())) {
      const fStr = df.toISOString().split('T')[0];
      const tStr = dt.toISOString().split('T')[0];
      searchUrl += `&start_date=${fStr}&end_date=${tStr}`;
    }
  }
  console.log(`[Kompas] Scraping search (HTML): ${searchUrl}`);

  try {
    const $ = await fetchPage(searchUrl);
    const urls = [];

    // GSE render via JS → biasanya 0 hasil di Cheerio
    // Tetap mencoba berbagai selector
    $('a.article__link, .gs-title a, h3 a, a.news-link, a[href*="/read/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (isKompasArticleUrl(href)) urls.push(href.split('?')[0]);
    });

    if (urls.length === 0) {
      console.warn('[Kompas] Search HTML tidak menghasilkan URL (kemungkinan CSE JS-only).');
    }
    return urls;
  } catch (err) {
    console.warn('[Kompas] scrapeKompasSearch gagal:', err.message);
    return [];
  }
}

// ── Strategi 4: Multi-kategori keyword match ──────────────────────────────
// Jika query tidak cocok dengan nama kategori tapi bermakna topik tertentu,
// cari di beberapa kategori yang relevan.

const KEYWORD_CATEGORY_MAP = {
  dolar:      ['ekonomi', 'nasional'],
  rupiah:     ['ekonomi'],
  saham:      ['ekonomi'],
  ihsg:       ['ekonomi'],
  inflasi:    ['ekonomi'],
  pajak:      ['ekonomi', 'nasional'],
  pemilu:     ['nasional'],
  presiden:   ['nasional'],
  prabowo:    ['nasional'],
  mahkamah:   ['nasional'],
  covid:      ['kesehatan', 'nasional'],
  timnas:     ['olahraga'],
  liga:       ['olahraga'],
  ai:         ['teknologi'],
  iphone:     ['teknologi'],
  gadget:     ['teknologi'],
};

function guessCategories(query) {
  const q = query.toLowerCase();
  for (const [keyword, cats] of Object.entries(KEYWORD_CATEGORY_MAP)) {
    if (q.includes(keyword)) return cats;
  }
  return ['nasional', 'ekonomi']; // default
}

// ── Filter tanggal ────────────────────────────────────────────────────────

function filterByDate(articles, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return articles;
  return articles.filter(a => {
    if (!a.published_date) return true; // tetap ikutkan jika tanggal tidak diketahui
    const pub = new Date(a.published_date);
    if (dateFrom && pub < new Date(dateFrom)) return false;
    if (dateTo   && pub > new Date(dateTo))   return false;
    return true;
  });
}

// ── Fungsi utama ───────────────────────────────────────────────────────────

/**
 * Scrape artikel dari Kompas.com
 *
 * @param {string}  query        - Kata kunci atau nama kategori
 * @param {number}  maxArticles  - Jumlah artikel yang diinginkan (default 5)
 * @param {string}  dateFrom     - ISO date string batas awal (opsional)
 * @param {string}  dateTo       - ISO date string batas akhir (opsional)
 * @returns {Promise<Array>}
 */
export async function scrapeKompas(query, maxArticles = 5, dateFrom, dateTo) {
  try {
    const qLower = query ? query.toLowerCase().trim() : '';
    let urls = [];

    // ── Pilih strategi pengumpulan URL ──────────────────────────────────

    if (!query) {
      // Tidak ada query → ambil berita terkini dari halaman utama
      console.log('[Kompas] Scraping halaman utama...');
      urls = await scrapeCategory(BASE_URL);

    } else if (CATEGORY_URLS[qLower] && !dateFrom && !dateTo) {
      // Query adalah nama kategori → langsung ke subdomain
      console.log(`[Kompas] Scraping kategori: ${CATEGORY_URLS[qLower]}`);
      urls = await scrapeCategory(CATEGORY_URLS[qLower]);

    } else {
      // Query bebas → coba beberapa strategi secara berurutan

      // Strategi A: Google CSE API (paling akurat)
      if (GOOGLE_API_KEY && GOOGLE_CX) {
        console.log('[Kompas] Mencari via Google CSE API...');
        urls = await searchViaGoogleCSE(query, dateFrom, dateTo);
      }

      // Strategi B: Scrape HTML search (biasanya 0 hasil karena CSE JS)
      if (urls.length === 0) {
        urls = await scrapeKompasSearch(query, dateFrom, dateTo);
      }

      // Strategi C: Scrape kategori yang relevan dengan keyword
      if (urls.length === 0) {
        const cats = guessCategories(qLower);
        console.log(`[Kompas] Fallback ke kategori relevan: ${cats.join(', ')}`);
        const catUrlSets = await Promise.all(
          cats.map(c => scrapeCategory(CATEGORY_URLS[c]).catch(() => []))
        );
        const allCatUrls = catUrlSets.flat();
        urls = [...new Set(allCatUrls)];
      }
    }

    // ── Dedup & batasi jumlah URL yang akan di-parse ────────────────────
    urls = [...new Set(urls)];
    const fetchLimit = maxArticles * 3; // ambil lebih banyak untuk kompensasi yang gagal
    urls = urls.slice(0, fetchLimit);
    console.log(`[Kompas] URLs ditemukan: ${urls.length}, akan di-parse...`);

    // ── Parse artikel secara berurutan (hindari ban IP) ─────────────────
    const articles = [];
    for (const url of urls) {
      if (articles.length >= maxArticles) break;
      const art = await parseArticle(url);
      if (art) {
        articles.push(art);
        console.log(`[Kompas] ✅ ${art.title.substring(0, 70)}`);
      }
    }

    // ── Filter berdasarkan tanggal (jika ada) ───────────────────────────
    const filtered = filterByDate(articles, dateFrom, dateTo);

    // ── Filter berdasarkan kata kunci (jika query bukan nama kategori) ──
    let result = filtered;
    if (query && !CATEGORY_URLS[qLower]) {
      const keywords = qLower.split(/\s+/);
      const keywordFiltered = filtered.filter(a => {
        const text = `${a.title} ${a.content}`.toLowerCase();
        return keywords.some(kw => text.includes(kw));
      });
      // Gunakan filter keyword hanya jika hasilnya tidak kosong
      if (keywordFiltered.length > 0) result = keywordFiltered;
    }

    // Batasi ke maxArticles
    result = result.slice(0, maxArticles);

    console.log(`[Kompas] Total artikel dikembalikan: ${result.length}`);
    return result;

  } catch (err) {
    console.error('[Kompas] Scraping gagal:', err.message);
    return [];
  }
}