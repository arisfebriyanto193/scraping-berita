/**
 * cnbcindonesia.js - Realtime scraper untuk CNBCIndonesia.com
 *
 * Karakteristik UNIK CNBC Indonesia — berbeda dari semua platform sebelumnya:
 *
 * 1. POLA URL ARTIKEL — mengandung timestamp datetime di path:
 *    cnbcindonesia.com/<kategori>/<YYYYMMDDHHMMSS>-<type-id>/<slug>
 *    Contoh:
 *      cnbcindonesia.com/market/20260531200002-17-739080/breaking-pemerintah-revisi-pp...
 *      cnbcindonesia.com/tech/20260309143746-37-717360/thr-2026-cair-driver-ojol...
 *      cnbcindonesia.com/news/20260529052708-4-738542/kategori-asn-pejabat-negara...
 *      cnbcindonesia.com/research/20260218114837-128-711754/ubo-terbuka-likuiditas...
 *    Format segment ID: <datetime14digit>-<type>-<article_id>
 *    Keuntungan: tanggal artikel bisa diparse LANGSUNG dari URL!
 *
 * 2. FOKUS KONTEN — ekonomi & bisnis (bukan general news):
 *    CNBC Indonesia adalah portal berita ekonomi/bisnis, terafiliasi CNBC
 *    International, di bawah Trans Media (Trans TV, Trans7, Detikcom, CNN ID).
 *    Kategori utama: market, news, tech, research, syariah, entrepreneur
 *    Tidak ada kategori: olahraga, hiburan, otomotif (itu ranah Trans7/CNN ID)
 *
 * 3. KATEGORI AKTIF — diverifikasi Mei 2026:
 *    /market   → Pasar modal, saham, reksadana, valas, komoditas
 *    /news     → Berita ekonomi nasional & internasional
 *    /tech     → Startup, fintech, bitcoin, teknologi
 *    /lifestyle → Gaya hidup bisnis
 *    /research → Riset & analisis mendalam
 *    /syariah  → Ekonomi & keuangan syariah
 *    /opini    → Kolom & opini
 *    /entrepreneur → Wirausaha & UMKM
 *
 * 4. HALAMAN INDEKS:
 *    cnbcindonesia.com/indeks — listing semua artikel terbaru ✅
 *    cnbcindonesia.com/<kategori>/indeks — per kategori ✅ (jika ada)
 *
 * 5. SEARCH:
 *    cnbcindonesia.com/search?query=<query> — perlu diverifikasi
 *
 * 6. TAG/TOPIK:
 *    cnbcindonesia.com/tag/<slug> — tersedia ✅
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// ── Konstanta ──────────────────────────────────────────────────────────────

const BASE_URL  = 'https://www.cnbcindonesia.com';
const DELAY_MS  = parseInt(process.env.SCRAPE_DELAY_MS || '600');
const MAX_RETRY = 2;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

// ── Kategori aktif — diverifikasi Mei 2026 ────────────────────────────────

const CATEGORY_URLS = {
  // Pasar Modal & Keuangan
  market:         `${BASE_URL}/market`,
  saham:          `${BASE_URL}/market`,
  pasar:          `${BASE_URL}/market`,
  'pasar modal':  `${BASE_URL}/market`,
  reksadana:      `${BASE_URL}/market`,
  valas:          `${BASE_URL}/market`,
  komoditas:      `${BASE_URL}/market`,
  ihsg:           `${BASE_URL}/market`,

  // Berita Ekonomi
  news:           `${BASE_URL}/news`,
  ekonomi:        `${BASE_URL}/news`,
  bisnis:         `${BASE_URL}/news`,
  nasional:       `${BASE_URL}/news`,
  internasional:  `${BASE_URL}/news`,
  makro:          `${BASE_URL}/news`,

  // Teknologi & Startup
  tech:           `${BASE_URL}/tech`,
  teknologi:      `${BASE_URL}/tech`,
  startup:        `${BASE_URL}/tech`,
  fintech:        `${BASE_URL}/tech`,
  bitcoin:        `${BASE_URL}/tech`,
  kripto:         `${BASE_URL}/tech`,
  crypto:         `${BASE_URL}/tech`,

  // Riset & Analisis
  research:       `${BASE_URL}/research`,
  riset:          `${BASE_URL}/research`,
  analisis:       `${BASE_URL}/research`,

  // Gaya Hidup
  lifestyle:      `${BASE_URL}/lifestyle`,
  'gaya hidup':   `${BASE_URL}/lifestyle`,

  // Syariah
  syariah:        `${BASE_URL}/syariah`,
  'ekonomi syariah': `${BASE_URL}/syariah`,

  // Opini & Wirausaha
  opini:          `${BASE_URL}/opini`,
  entrepreneur:   `${BASE_URL}/entrepreneur`,
  umkm:           `${BASE_URL}/entrepreneur`,
  wirausaha:      `${BASE_URL}/entrepreneur`,
};

// Segment kategori URL → label standar
const PATH_CATEGORY = {
  market:       'pasar modal',
  news:         'ekonomi',
  tech:         'teknologi',
  lifestyle:    'gaya hidup',
  research:     'riset',
  syariah:      'syariah',
  opini:        'opini',
  entrepreneur: 'wirausaha',
};

// Keyword → kategori relevan
const KEYWORD_CATEGORY_MAP = {
  // Market & Keuangan
  dolar:        ['market', 'news'],
  rupiah:       ['market', 'news'],
  saham:        ['market'],
  ihsg:         ['market'],
  reksadana:    ['market'],
  obligasi:     ['market'],
  valas:        ['market'],
  emas:         ['market'],
  komoditas:    ['market'],
  minyak:       ['market', 'news'],
  inflasi:      ['news', 'market'],
  suku:         ['market', 'news'],
  bi:           ['market', 'news'],
  ojk:          ['market', 'news'],
  bei:          ['market'],

  // Bisnis & Ekonomi
  pajak:        ['news'],
  apbn:         ['news'],
  anggaran:     ['news'],
  ekspor:       ['news'],
  impor:        ['news'],
  investasi:    ['news', 'market'],
  bumn:         ['news'],
  danantara:    ['news'],
  perdagangan:  ['news'],

  // Teknologi
  bitcoin:      ['tech'],
  crypto:       ['tech'],
  ethereum:     ['tech'],
  nft:          ['tech'],
  ai:           ['tech'],
  startup:      ['tech', 'entrepreneur'],
  gojek:        ['tech', 'news'],
  tokopedia:    ['tech', 'news'],
  fintech:      ['tech'],
  decacorn:     ['tech'],

  // Riset
  riset:        ['research'],
  analisis:     ['research'],
  proyeksi:     ['research'],
  outlook:      ['research'],

  // Syariah
  syariah:      ['syariah'],
  zakat:        ['syariah'],
  sukuk:        ['syariah'],
  halal:        ['syariah'],
};

// ── Utilitas ───────────────────────────────────────────────────────────────

const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const sleep    = ms  => new Promise(r => setTimeout(r, ms));

/**
 * Ambil kategori dari URL artikel CNBC Indonesia.
 * Pola: cnbcindonesia.com/<kategori>/<datetime-id>/<slug>
 */
function categoryFromUrl(url) {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    return PATH_CATEGORY[segments[0]] || segments[0] || 'umum';
  } catch {
    return 'umum';
  }
}

/**
 * Ekstrak tanggal publish LANGSUNG dari URL artikel CNBC Indonesia.
 * Format segment ID: <YYYYMMDDHHMMSS>-<type>-<article_id>
 * Contoh: 20260531200002-17-739080 → 2026-05-31T20:00:02.000Z
 *
 * Ini lebih reliabel dari meta tag karena selalu ada di URL.
 */
function dateFromUrl(url) {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    // segments[1] adalah ID segment, contoh: 20260531200002-17-739080
    const idSegment = segments[1] || '';
    const dtMatch   = idSegment.match(/^(\d{14})/);
    if (!dtMatch) return null;

    const dt = dtMatch[1];
    // Format: YYYYMMDDHHmmSS
    const year   = dt.slice(0, 4);
    const month  = dt.slice(4, 6);
    const day    = dt.slice(6, 8);
    const hour   = dt.slice(8, 10);
    const minute = dt.slice(10, 12);
    const second = dt.slice(12, 14);

    const d = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Validasi URL artikel CNBC Indonesia.
 * Pola wajib: path[0] = kategori, path[1] = <datetime14>-<id>-<articleid>, path[2] = slug
 */
function isCNBCArticleUrl(href) {
  if (!href || !href.startsWith('http')) return false;
  if (!href.includes('cnbcindonesia.com')) return false;

  const excludes = [
    '/tag/', '/search', '/indeks', '/video/', '/foto/', '/live',
    '/about', '/redaksi', '/advertise', '#', 'javascript:',
    '/tv/', '/podcast/',
  ];
  if (excludes.some(ex => href.includes(ex))) return false;

  try {
    const { pathname } = new URL(href);
    const segments = pathname.split('/').filter(Boolean);
    // Harus ada minimal 2 segmen dan segment[1] diawali 14 digit timestamp
    return segments.length >= 2 && /^\d{14}-\d+-\d+/.test(segments[1]);
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
          'Referer':         'https://www.cnbcindonesia.com/',
        },
        timeout: 25000,
        maxRedirects: 5,
      });
      return cheerio.load(res.data);
    } catch (err) {
      const status = err.response?.status;
      console.warn(`[CNBC] Attempt ${attempt}/${retries} gagal untuk ${url}: ${err.message}`);
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

    // ── Judul ──
    const title =
      $('h1.detail-title').first().text().trim() ||
      $('h1[itemprop="headline"]').first().text().trim() ||
      $('h1.article-title').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('h1').first().text().trim();

    // ── Konten ──
    // CNBC Indonesia: div.detail-text atau div[itemprop="articleBody"]
    const contentSelectors = [
      'div.detail-text',
      'div[itemprop="articleBody"]',
      'div.article-content',
      'div.content-detail',
      'div.detail-body',
      'article.detail',
      'article',
    ];
    let contentEl = null;
    for (const sel of contentSelectors) {
      if ($(sel).length) { contentEl = $(sel).first(); break; }
    }

    let content = '';
    if (contentEl) {
      contentEl.find([
        'script', 'style', 'figure', 'aside', 'iframe',
        '.ads', '.advertisement', '.baca-juga', '.related',
        'noscript', '.share-button', '.tag-article',
        '.embed-video', '.cnbc-embed', '.box-artikel',
      ].join(',')).remove();
      content = contentEl.text().replace(/\s+/g, ' ').trim();
    }

    // Fallback: kumpulkan paragraf
    if (!content || content.length < 80) {
      const parts = [];
      $('div.detail-text p, div[itemprop="articleBody"] p, article p').each((_, el) => {
        const t = $(el).text().trim();
        if (t.length > 30) parts.push(t);
      });
      content = parts.join(' ').trim();
    }

    // ── Tanggal — prioritaskan ekstrak dari URL (paling akurat) ──
    let published_date = dateFromUrl(url);

    // Fallback ke meta tag jika URL parse gagal
    if (!published_date) {
      const dateMeta =
        $('meta[property="article:published_time"]').attr('content') ||
        $('meta[itemprop="datePublished"]').attr('content') ||
        $('[itemprop="datePublished"]').attr('content') ||
        $('time').first().attr('datetime');

      if (dateMeta) {
        const d = new Date(dateMeta);
        if (!isNaN(d.getTime())) published_date = d.toISOString();
      }
    }

    // Fallback teks tanggal — format "31 Mei 2026, 20:00 WIB"
    if (!published_date) {
      const dateText =
        $('span.date').first().text().trim() ||
        $('div.date').first().text().trim() ||
        $('[class*="date"]').first().text().trim();

      const MONTHS = {
        Januari:1, Februari:2, Maret:3, April:4, Mei:5, Juni:6,
        Juli:7, Agustus:8, September:9, Oktober:10, November:11, Desember:12,
      };
      const match = dateText?.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
      if (match && MONTHS[match[2]]) {
        published_date = new Date(
          parseInt(match[3]), MONTHS[match[2]] - 1, parseInt(match[1])
        ).toISOString();
      }
    }

    // ── Penulis ──
    const author =
      $('[itemprop="author"]').first().text().trim() ||
      $('meta[name="author"]').attr('content')?.trim() ||
      $('span.detail-author').first().text().trim() ||
      $('a.author').first().text().trim() ||
      null;

    // ── Gambar & deskripsi ──
    const image_url   = $('meta[property="og:image"]').attr('content') || null;
    const description = $('meta[property="og:description"]').attr('content')?.trim() || null;

    // ── Validasi ──
    if (!title || title.length < 10) {
      console.warn(`[CNBC] Skip (judul kosong): ${url}`);
      return null;
    }
    if (!content || content.length < 80) {
      if (description?.length > 50) {
        return {
          title, content: description, url, source: 'cnbcindonesia',
          published_date, author, image_url,
          category: categoryFromUrl(url),
        };
      }
      console.warn(`[CNBC] Skip (konten kosong): ${url}`);
      return null;
    }

    return {
      title,
      content,
      url,
      source: 'cnbcindonesia',
      published_date,
      author: author || null,
      image_url,
      category: categoryFromUrl(url),
    };
  } catch (err) {
    console.error(`[CNBC] Error parse ${url}:`, err.message);
    return null;
  }
}

// ── Kumpulkan URL dari halaman listing ────────────────────────────────────

async function scrapeListingPage(pageUrl) {
  const $ = await fetchPage(pageUrl);
  const links = new Set();

  const selectors = [
    'h2.detail-title a',
    'h3.detail-title a',
    'article h2 a',
    'article h3 a',
    '.headline-list h2 a',
    '.headline-list h3 a',
    '.list-berita h3 a',
    '.card-news h3 a',
    'a[href*="/market/"]',
    'a[href*="/news/"]',
    'a[href*="/tech/"]',
    'a[href*="/research/"]',
    'a[href*="/lifestyle/"]',
    'a[href*="/syariah/"]',
    'a[href*="/entrepreneur/"]',
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr('href');
      if (isCNBCArticleUrl(href)) links.add(href.split('?')[0]);
    });
  }

  return [...links];
}

// ── Scrape halaman indeks (listing statis paling reliabel) ─────────────────

async function scrapeIndeksPage(categorySlug = '') {
  const indeksUrl = categorySlug
    ? `${BASE_URL}/${categorySlug}/indeks`
    : `${BASE_URL}/indeks`;
  console.log(`[CNBC] Scraping indeks: ${indeksUrl}`);
  try {
    return await scrapeListingPage(indeksUrl);
  } catch (err) {
    // Fallback ke halaman kategori utama
    console.warn(`[CNBC] Indeks gagal, coba halaman kategori: ${err.message}`);
    const catUrl = categorySlug ? `${BASE_URL}/${categorySlug}` : BASE_URL;
    return scrapeListingPage(catUrl).catch(() => []);
  }
}

// ── Scrape search ─────────────────────────────────────────────────────────

async function scrapeCNBCSearch(query) {
  const searchUrl = `${BASE_URL}/search?query=${encodeURIComponent(query)}`;
  console.log(`[CNBC] Scraping search: ${searchUrl}`);
  try {
    const urls = await scrapeListingPage(searchUrl);
    if (urls.length === 0) console.warn('[CNBC] Search tidak menghasilkan URL.');
    return urls;
  } catch (err) {
    console.warn('[CNBC] Search gagal:', err.message);
    return [];
  }
}

// ── Scrape tag page ───────────────────────────────────────────────────────

async function scrapeTagPage(query) {
  const slug   = query.toLowerCase().replace(/\s+/g, '-');
  const tagUrl = `${BASE_URL}/tag/${encodeURIComponent(slug)}`;
  console.log(`[CNBC] Scraping tag: ${tagUrl}`);
  try {
    return await scrapeListingPage(tagUrl);
  } catch (err) {
    console.warn(`[CNBC] Tag page gagal (${slug}):`, err.message);
    return [];
  }
}

// ── Tentukan kategori relevan dari keyword ────────────────────────────────

function guessCategories(query) {
  const q = query.toLowerCase();
  for (const [kw, cats] of Object.entries(KEYWORD_CATEGORY_MAP)) {
    if (q.includes(kw)) return cats;
  }
  return ['news', 'market']; // default CNBC = ekonomi/bisnis
}

// ── Filter tanggal ────────────────────────────────────────────────────────
// BONUS: dateFromUrl() bisa dipakai untuk pre-filter sebelum parse artikel
// sehingga kita tidak perlu fetch artikel yang di luar range tanggal

function isUrlInDateRange(url, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const pubDate = dateFromUrl(url);
  if (!pubDate) return true; // tetap fetch jika tidak bisa parse tanggal dari URL
  const pub = new Date(pubDate);
  if (dateFrom && pub < new Date(dateFrom)) return false;
  if (dateTo   && pub > new Date(dateTo))   return false;
  return true;
}

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
 * Scrape artikel dari CNBCIndonesia.com
 *
 * @param {string}  query        - Kata kunci atau nama kategori
 * @param {number}  maxArticles  - Default 5
 * @param {string}  dateFrom     - ISO date (opsional)
 * @param {string}  dateTo       - ISO date (opsional)
 */
export async function scrapeCNBC(query, maxArticles = 5, dateFrom, dateTo) {
  try {
    const qLower = query ? query.toLowerCase().trim() : '';
    let urls = [];

    if (!query) {
      // Tidak ada query → indeks utama
      console.log('[CNBC] Scraping indeks utama...');
      urls = await scrapeIndeksPage();

    } else if (CATEGORY_URLS[qLower] && !dateFrom && !dateTo) {
      // Query cocok dengan kategori
      const catUrl  = CATEGORY_URLS[qLower];
      const catSlug = catUrl.replace(`${BASE_URL}/`, '');
      console.log(`[CNBC] Scraping indeks kategori: ${catSlug}`);
      urls = await scrapeIndeksPage(catSlug);

    } else {
      // Query bebas — coba berurutan

      // Strategi 1: Search
      urls = await scrapeCNBCSearch(query);

      // Strategi 2: Tag page
      if (urls.length === 0) {
        urls = await scrapeTagPage(query);
      }

      // Strategi 3: Indeks kategori relevan
      if (urls.length === 0) {
        const cats = guessCategories(qLower);
        console.log(`[CNBC] Fallback indeks kategori: ${cats.join(', ')}`);
        const results = await Promise.all(
          cats.map(c => scrapeIndeksPage(c).catch(() => []))
        );
        urls = [...new Set(results.flat())];
      }
    }

    // Dedup, pre-filter tanggal dari URL (optimasi — hindari fetch artikel di luar range)
    urls = [...new Set(urls)]
      .filter(u => isUrlInDateRange(u, dateFrom, dateTo))
      .slice(0, maxArticles * 3);

    console.log(`[CNBC] URLs ditemukan: ${urls.length}, mulai parse...`);

    const articles = [];
    for (const url of urls) {
      if (articles.length >= maxArticles) break;
      const art = await parseArticle(url);
      if (art) {
        articles.push(art);
        console.log(`[CNBC] ✅ ${art.title.substring(0, 70)}`);
      }
    }

    // Filter tanggal (post-parse untuk akurasi penuh)
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
    console.log(`[CNBC] Total artikel dikembalikan: ${result.length}`);
    return result;

  } catch (err) {
    console.error('[CNBC] Scraping gagal:', err.message);
    return [];
  }
}