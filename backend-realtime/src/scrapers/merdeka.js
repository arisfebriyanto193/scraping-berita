/**
 * merdeka.js - Realtime scraper untuk Merdeka.com
 *
 * Menggantikan: tempo.js
 * Alasan dipilih: Portal berita general dengan traffic tinggi, struktur
 * HTML bersih, cakupan topik luas, bagian KapanLagi Youniverse (KLY).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KARAKTERISTIK UNIK MERDEKA.COM:
 *
 * 1. POLA URL ARTIKEL — menggunakan suffix "-mvk.html" yang khas:
 *    merdeka.com/<kategori>/<judul-slug>-<article-id>-mvk.html
 *    Contoh:
 *      merdeka.com/peristiwa/dxi-2026-menteri-ekonomi-kreatif-...-566412-mvk.html
 *      merdeka.com/politik/soekarno-run-2026-...-535786-mvk.html
 *      merdeka.com/uang/rupiah-makin-mendekati-rp-18000-...-mvk.html
 *    Suffix "-mvk.html" wajib ada → mudah divalidasi
 *    Article ID (angka) selalu ada sebelum "-mvk.html"
 *
 * 2. KATEGORI AKTIF — diverifikasi dari homepage & menu Merdeka Juni 2026:
 *    /peristiwa  → Berita nasional & terkini (kategori utama)
 *    /politik    → Politik & pemerintahan
 *    /uang       → Ekonomi & keuangan (bukan /ekonomi!)
 *    /teknologi  → Teknologi & digital
 *    /artis      → Hiburan & selebriti
 *    /sehat      → Kesehatan
 *    /bola       → Sepakbola
 *    /sport      → Olahraga umum
 *    /otomotif   → Otomotif
 *    /travel     → Wisata & perjalanan
 *    /gaya       → Gaya hidup & lifestyle
 *    /dunia      → Berita internasional
 *    /jakarta    → Berita DKI Jakarta
 *    /properti   → Properti & hunian
 *    CATATAN:
 *    - Ekonomi di Merdeka = /uang (BUKAN /ekonomi)
 *    - Nasional di Merdeka = /peristiwa (BUKAN /nasional)
 *    - Hiburan di Merdeka = /artis (BUKAN /hiburan)
 *
 * 3. TAG PAGE:
 *    merdeka.com/tag/<slug> — aktif ✅
 *
 * 4. SEARCH:
 *    merdeka.com/search/<query> — path-based ✅
 *
 * 5. INDEKS:
 *    merdeka.com/<kategori>/indeks.html — tersedia per kategori ✅
 *
 * 6. Merdeka.com adalah bagian KapanLagi Youniverse (KLY) —
 *    satu grup dengan KapanLagi.com, Fimela.com, Bola.com, Dream.co.id
 * ═══════════════════════════════════════════════════════════════════════════
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// ── Konstanta ──────────────────────────────────────────────────────────────

const BASE_URL  = 'https://www.merdeka.com';
const DELAY_MS  = parseInt(process.env.SCRAPE_DELAY_MS || '600');
const MAX_RETRY = 2;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

// ── Kategori aktif — diverifikasi Juni 2026 ───────────────────────────────

const CATEGORY_URLS = {
  // Berita Nasional
  peristiwa:      `${BASE_URL}/peristiwa`,
  nasional:       `${BASE_URL}/peristiwa`,
  berita:         `${BASE_URL}/peristiwa`,
  terkini:        `${BASE_URL}/peristiwa`,

  // Politik
  politik:        `${BASE_URL}/politik`,
  pemerintahan:   `${BASE_URL}/politik`,
  hukum:          `${BASE_URL}/politik`,

  // Ekonomi — di Merdeka namanya /uang bukan /ekonomi
  uang:           `${BASE_URL}/uang`,
  ekonomi:        `${BASE_URL}/uang`,
  bisnis:         `${BASE_URL}/uang`,
  keuangan:       `${BASE_URL}/uang`,
  rupiah:         `${BASE_URL}/uang`,

  // Teknologi
  teknologi:      `${BASE_URL}/teknologi`,
  tekno:          `${BASE_URL}/teknologi`,
  digital:        `${BASE_URL}/teknologi`,
  gadget:         `${BASE_URL}/teknologi`,

  // Hiburan — di Merdeka namanya /artis
  artis:          `${BASE_URL}/artis`,
  hiburan:        `${BASE_URL}/artis`,
  seleb:          `${BASE_URL}/artis`,
  selebriti:      `${BASE_URL}/artis`,
  film:           `${BASE_URL}/artis`,
  musik:          `${BASE_URL}/artis`,

  // Kesehatan
  sehat:          `${BASE_URL}/sehat`,
  kesehatan:      `${BASE_URL}/sehat`,
  health:         `${BASE_URL}/sehat`,

  // Olahraga
  bola:           `${BASE_URL}/bola`,
  sepakbola:      `${BASE_URL}/bola`,
  sport:          `${BASE_URL}/sport`,
  olahraga:       `${BASE_URL}/sport`,

  // Lainnya
  otomotif:       `${BASE_URL}/otomotif`,
  travel:         `${BASE_URL}/travel`,
  wisata:         `${BASE_URL}/travel`,
  gaya:           `${BASE_URL}/gaya`,
  'gaya hidup':   `${BASE_URL}/gaya`,
  lifestyle:      `${BASE_URL}/gaya`,
  dunia:          `${BASE_URL}/dunia`,
  internasional:  `${BASE_URL}/dunia`,
  jakarta:        `${BASE_URL}/jakarta`,
  properti:       `${BASE_URL}/properti`,
};

// Segmen kategori URL → label standar
const PATH_CATEGORY = {
  peristiwa:  'nasional',
  politik:    'nasional',
  uang:       'ekonomi',
  teknologi:  'teknologi',
  artis:      'hiburan',
  sehat:      'kesehatan',
  bola:       'olahraga',
  sport:      'olahraga',
  otomotif:   'otomotif',
  travel:     'travel',
  gaya:       'gaya hidup',
  dunia:      'internasional',
  jakarta:    'regional',
  properti:   'properti',
};

// Keyword → kategori relevan
const KEYWORD_CATEGORY_MAP = {
  dolar:        ['uang'],
  rupiah:       ['uang'],
  saham:        ['uang'],
  ihsg:         ['uang'],
  inflasi:      ['uang'],
  pajak:        ['uang', 'politik'],
  anggaran:     ['uang', 'politik'],
  bumn:         ['uang', 'peristiwa'],
  pemilu:       ['politik'],
  presiden:     ['politik'],
  prabowo:      ['politik'],
  dpr:          ['politik'],
  korupsi:      ['politik'],
  kpk:          ['politik'],
  polri:        ['peristiwa'],
  covid:        ['sehat', 'peristiwa'],
  vaksin:       ['sehat'],
  kanker:       ['sehat'],
  diet:         ['sehat', 'gaya'],
  timnas:       ['bola'],
  liga:         ['bola'],
  persija:      ['bola'],
  motogp:       ['sport'],
  bulutangkis:  ['sport'],
  iphone:       ['teknologi'],
  android:      ['teknologi'],
  laptop:       ['teknologi'],
  ai:           ['teknologi'],
  startup:      ['teknologi', 'uang'],
  artis:        ['artis'],
  drakor:       ['artis'],
  fashion:      ['gaya'],
  kuliner:      ['gaya', 'travel'],
  gempa:        ['peristiwa'],
  banjir:       ['peristiwa', 'jakarta'],
  israel:       ['dunia'],
  perang:       ['dunia', 'peristiwa'],
};

// ── Utilitas ───────────────────────────────────────────────────────────────

const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const sleep    = ms  => new Promise(r => setTimeout(r, ms));

/**
 * Ambil kategori dari URL artikel Merdeka.
 * Pola: merdeka.com/<kategori>/<slug>-<id>-mvk.html
 * Kategori ada di segments[0].
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
 * Validasi URL artikel Merdeka.
 * Ciri khas wajib: diakhiri dengan "-mvk.html"
 * dan mengandung angka ID artikel.
 */
function isMerdekaArticleUrl(href) {
  if (!href || !href.startsWith('http')) return false;
  if (!href.includes('merdeka.com')) return false;

  // Suffix khas Merdeka
  if (!href.includes('-mvk.html')) return false;

  const excludes = [
    '/tag/', '/search', '/indeks', '/video/', '/foto/',
    '/company/', '/redaksi', '/advertise', '#', 'javascript:',
    '/foto-', '/infografis/',
  ];
  if (excludes.some(ex => href.includes(ex))) return false;

  try {
    const { pathname } = new URL(href);
    const segments = pathname.split('/').filter(Boolean);
    // Minimal 2 segmen: /<kategori>/<slug>-mvk.html
    return segments.length >= 2 && /\d{4,}-mvk\.html$/.test(pathname);
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
          'Referer':         'https://www.merdeka.com/',
        },
        timeout: 25000,
        maxRedirects: 5,
      });
      return cheerio.load(res.data);
    } catch (err) {
      const status = err.response?.status;
      console.warn(`[Merdeka] Attempt ${attempt}/${retries} gagal untuk ${url}: ${err.message}`);
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
      $('h1.article-title').first().text().trim() ||
      $('h1[itemprop="headline"]').first().text().trim() ||
      $('h1.title').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('h1').first().text().trim();

    // ── Konten ──
    // Merdeka: div.article-body atau div[itemprop="articleBody"]
    const contentSelectors = [
      'div.article-body',
      'div[itemprop="articleBody"]',
      'div.article-content',
      'div#article-body',
      'div.content-article',
      'div.detail-content',
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
        '.ads', '.advertisement', '.baca-juga', '.related-news',
        'noscript', '.share-button', '.tag-list', '.iklan',
        '.widget', '.embed', '.box-ads',
      ].join(',')).remove();
      content = contentEl.text().replace(/\s+/g, ' ').trim();
    }

    // Fallback: kumpulkan paragraf
    if (!content || content.length < 80) {
      const parts = [];
      $('div.article-body p, div[itemprop="articleBody"] p, article p').each((_, el) => {
        const t = $(el).text().trim();
        if (t.length > 30) parts.push(t);
      });
      content = parts.join(' ').trim();
    }

    // ── Tanggal ──
    let published_date = null;

    const dateMeta =
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[itemprop="datePublished"]').attr('content') ||
      $('[itemprop="datePublished"]').attr('content') ||
      $('time').first().attr('datetime');

    if (dateMeta) {
      const d = new Date(dateMeta);
      if (!isNaN(d.getTime())) published_date = d.toISOString();
    }

    // Fallback: teks tanggal — format "5 Juni 2026 09:48" atau "2026-06-05 09:48:00"
    if (!published_date) {
      const dateText =
        $('span.article-date').first().text().trim() ||
        $('div.date').first().text().trim() ||
        $('span.date').first().text().trim() ||
        $('[class*="date"]').first().text().trim();

      // Coba ISO format dulu
      if (dateText) {
        const d = new Date(dateText);
        if (!isNaN(d.getTime())) {
          published_date = d.toISOString();
        } else {
          // Coba parse format Indonesia
          const MONTHS = {
            Januari:1, Februari:2, Maret:3, April:4, Mei:5, Juni:6,
            Juli:7, Agustus:8, September:9, Oktober:10, November:11, Desember:12,
          };
          const match = dateText.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
          if (match && MONTHS[match[2]]) {
            published_date = new Date(
              parseInt(match[3]), MONTHS[match[2]] - 1, parseInt(match[1])
            ).toISOString();
          }
        }
      }
    }

    // ── Penulis ──
    const author =
      $('[itemprop="author"]').first().text().trim() ||
      $('meta[name="author"]').attr('content')?.trim() ||
      $('span.reporter').first().text().trim() ||
      $('div.author-name').first().text().trim() ||
      null;

    // ── Gambar & deskripsi ──
    const image_url   = $('meta[property="og:image"]').attr('content') || null;
    const description = $('meta[property="og:description"]').attr('content')?.trim() || null;

    // ── Validasi ──
    if (!title || title.length < 10) {
      console.warn(`[Merdeka] Skip (judul kosong): ${url}`);
      return null;
    }
    if (!content || content.length < 80) {
      if (description?.length > 50) {
        return {
          title, content: description, url, source: 'merdeka',
          published_date, author, image_url,
          category: categoryFromUrl(url),
        };
      }
      console.warn(`[Merdeka] Skip (konten kosong): ${url}`);
      return null;
    }

    return {
      title,
      content,
      url,
      source: 'merdeka',
      published_date,
      author: author || null,
      image_url,
      category: categoryFromUrl(url),
    };
  } catch (err) {
    console.error(`[Merdeka] Error parse ${url}:`, err.message);
    return null;
  }
}

// ── Kumpulkan URL dari halaman listing ────────────────────────────────────

async function scrapeListingPage(pageUrl) {
  const $ = await fetchPage(pageUrl);
  const links = new Set();

  const selectors = [
    'h2.article-title a',
    'h3.article-title a',
    'h2.title a',
    'h3.title a',
    'article h2 a',
    'article h3 a',
    '.list-news h3 a',
    '.news-item h3 a',
    '.card-news h3 a',
    'a[href*="-mvk.html"]',   // fallback: ciri khas Merdeka
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr('href');
      if (isMerdekaArticleUrl(href)) links.add(href.split('?')[0]);
    });
  }

  return [...links];
}

// ── Scrape halaman indeks kategori ────────────────────────────────────────
// merdeka.com/<kategori>/indeks.html — listing statis per kategori

async function scrapeIndeksPage(categorySlug) {
  const indeksUrl = `${BASE_URL}/${categorySlug}/indeks.html`;
  console.log(`[Merdeka] Scraping indeks: ${indeksUrl}`);
  try {
    return await scrapeListingPage(indeksUrl);
  } catch (err) {
    console.warn(`[Merdeka] Indeks gagal, coba halaman kategori: ${err.message}`);
    return scrapeListingPage(`${BASE_URL}/${categorySlug}`).catch(() => []);
  }
}

// ── Scrape search ─────────────────────────────────────────────────────────
// merdeka.com/search/<query> — path-based

async function scrapeMerdekaSearch(query) {
  const searchUrl = `${BASE_URL}/search/${encodeURIComponent(query.replace(/\s+/g, '+'))}`;
  console.log(`[Merdeka] Scraping search: ${searchUrl}`);
  try {
    const urls = await scrapeListingPage(searchUrl);
    if (urls.length === 0) console.warn('[Merdeka] Search tidak menghasilkan URL.');
    return urls;
  } catch (err) {
    console.warn('[Merdeka] Search gagal:', err.message);
    return [];
  }
}

// ── Scrape tag page ───────────────────────────────────────────────────────

async function scrapeTagPage(query) {
  const slug   = query.toLowerCase().replace(/\s+/g, '-');
  const tagUrl = `${BASE_URL}/tag/${encodeURIComponent(slug)}`;
  console.log(`[Merdeka] Scraping tag: ${tagUrl}`);
  try {
    return await scrapeListingPage(tagUrl);
  } catch (err) {
    console.warn(`[Merdeka] Tag page gagal (${slug}):`, err.message);
    return [];
  }
}

// ── Tentukan kategori relevan dari keyword ────────────────────────────────

function guessCategories(query) {
  const q = query.toLowerCase();
  for (const [kw, cats] of Object.entries(KEYWORD_CATEGORY_MAP)) {
    if (q.includes(kw)) return cats;
  }
  return ['peristiwa', 'uang'];
}

// ── Filter tanggal ────────────────────────────────────────────────────────

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
 * Scrape artikel dari Merdeka.com
 *
 * @param {string}  query        - Kata kunci atau nama kategori
 * @param {number}  maxArticles  - Default 5
 * @param {string}  dateFrom     - ISO date (opsional)
 * @param {string}  dateTo       - ISO date (opsional)
 */
export async function scrapeMerdeka(query, maxArticles = 5, dateFrom, dateTo) {
  try {
    const qLower = query ? query.toLowerCase().trim() : '';
    let urls = [];

    if (!query) {
      // Tidak ada query → indeks peristiwa (berita terkini)
      console.log('[Merdeka] Scraping indeks peristiwa...');
      urls = await scrapeIndeksPage('peristiwa');

    } else if (CATEGORY_URLS[qLower] && !dateFrom && !dateTo) {
      // Query cocok dengan nama kategori
      const catUrl  = CATEGORY_URLS[qLower];
      const catSlug = catUrl.replace(`${BASE_URL}/`, '');
      console.log(`[Merdeka] Scraping indeks kategori: ${catSlug}`);
      urls = await scrapeIndeksPage(catSlug);

    } else {
      // Query bebas — coba berurutan

      // Strategi 1: Search path-based
      urls = await scrapeMerdekaSearch(query);

      // Strategi 2: Tag page
      if (urls.length === 0) {
        urls = await scrapeTagPage(query);
      }

      // Strategi 3: Indeks kategori relevan
      if (urls.length === 0) {
        const cats = guessCategories(qLower);
        console.log(`[Merdeka] Fallback indeks kategori: ${cats.join(', ')}`);
        const results = await Promise.all(
          cats.map(c => scrapeIndeksPage(c).catch(() => []))
        );
        urls = [...new Set(results.flat())];
      }
    }

    // Dedup & batasi
    urls = [...new Set(urls)].slice(0, maxArticles * 3);
    console.log(`[Merdeka] URLs ditemukan: ${urls.length}, mulai parse...`);

    const articles = [];
    for (const url of urls) {
      if (articles.length >= maxArticles) break;
      const art = await parseArticle(url);
      if (art) {
        articles.push(art);
        console.log(`[Merdeka] ✅ ${art.title.substring(0, 70)}`);
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
    console.log(`[Merdeka] Total artikel dikembalikan: ${result.length}`);
    return result;

  } catch (err) {
    console.error('[Merdeka] Scraping gagal:', err.message);
    return [];
  }
}