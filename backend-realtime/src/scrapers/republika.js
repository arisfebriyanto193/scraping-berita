/**
 * republika.js - Realtime scraper untuk Republika.co.id
 *
 * Menggantikan: merdeka.js (terlalu sedikit hasil karena React rendering)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KARAKTERISTIK UNIK REPUBLIKA:
 *
 * 1. ARSITEKTUR SUBDOMAIN PER KANAL — diverifikasi dari HTML asli Juni 2026:
 *    news.republika.co.id        → Nasional, Pendidikan, Sport, Internasional
 *    ekonomi.republika.co.id     → Bisnis Finansial (ekonomi, energi, otomotif)
 *    sport.republika.co.id       → Olahraga
 *    internasional.republika.co.id → Berita Internasional
 *    tekno.republika.co.id       → Teknologi
 *    khazanah.republika.co.id    → Islam & Keislaman
 *    sharia.republika.co.id      → Ekonomi Syariah
 *    analisis.republika.co.id    → Opini, Kolom, Analisis
 *    ameera.republika.co.id      → Gaya Hidup Perempuan & Halal
 *    esgnow.republika.co.id      → Lingkungan & ESG
 *    islamdigest.republika.co.id → Islam Digest
 *
 * 2. POLA URL ARTIKEL — konsisten di semua subdomain:
 *    <subdomain>.republika.co.id/berita/<id-alphanumeric>/<slug>
 *    Contoh:
 *      news.republika.co.id/berita/tg6kjc3430000/menkop-ferry-dukung-...
 *      ekonomi.republika.co.id/berita/te540i416/pemerintah-yakin-ekonomi-...
 *    Format ID: string alphanumeric ~13 karakter (bukan angka murni)
 *
 * 3. HALAMAN LISTING — HTML STATIS (tidak pakai React/JS render):
 *    Artikel langsung ada di HTML → Cheerio bisa baca sepenuhnya ✅
 *    URL artikel ada di elemen <a href="..."> di dalam listing
 *
 * 4. HALAMAN INDEKS GLOBAL:
 *    republika.co.id/indeks/ → listing semua berita terbaru ✅
 *
 * 5. TAG PAGE:
 *    republika.co.id/tag/<slug> — aktif ✅
 *
 * 6. Republika adalah media Islam terbesar di Indonesia (Mahaka X Group).
 *    Konten unik: Khazanah Islam, Ekonomi Syariah, Islam Digest, Iqra
 * ═══════════════════════════════════════════════════════════════════════════
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// ── Konstanta ──────────────────────────────────────────────────────────────

const BASE_URL  = 'https://republika.co.id';
const DELAY_MS  = parseInt(process.env.SCRAPE_DELAY_MS || '600');
const MAX_RETRY = 2;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

// ── Kanal/subdomain aktif — diverifikasi dari HTML asli Juni 2026 ──────────

const CATEGORY_URLS = {
  // Nasional & Politik
  nasional:       'https://news.republika.co.id/nasional-news',
  news:           'https://news.republika.co.id',
  politik:        'https://news.republika.co.id/nasional-news',
  hukum:          'https://news.republika.co.id/nasional-news',
  pendidikan:     'https://news.republika.co.id/pendidikan',

  // Ekonomi & Bisnis
  ekonomi:        'https://ekonomi.republika.co.id',
  bisnis:         'https://ekonomi.republika.co.id/bisnis',
  finansial:      'https://ekonomi.republika.co.id/finansial',
  keuangan:       'https://ekonomi.republika.co.id/finansial',
  energi:         'https://ekonomi.republika.co.id/energi',

  // Olahraga
  sport:          'https://news.republika.co.id/sport',
  olahraga:       'https://news.republika.co.id/sport',
  bola:           'https://news.republika.co.id/sport',
  sepakbola:      'https://news.republika.co.id/sport',

  // Internasional
  internasional:  'https://news.republika.co.id/internasional',
  dunia:          'https://news.republika.co.id/internasional',

  // Teknologi
  teknologi:      'https://tekno.republika.co.id',
  tekno:          'https://tekno.republika.co.id',
  digital:        'https://tekno.republika.co.id',

  // Islam & Keislaman (unik Republika)
  islam:          'https://khazanah.republika.co.id',
  khazanah:       'https://khazanah.republika.co.id',
  'islam digest': 'https://islamdigest.republika.co.id',
  islamdigest:    'https://islamdigest.republika.co.id',

  // Ekonomi Syariah
  syariah:        'https://sharia.republika.co.id',
  'ekonomi syariah': 'https://sharia.republika.co.id',

  // Gaya Hidup
  lifestyle:      'https://ameera.republika.co.id',
  'gaya hidup':   'https://ameera.republika.co.id',
  ameera:         'https://ameera.republika.co.id',
  halal:          'https://ameera.republika.co.id/my-halal',

  // Lingkungan & ESG
  lingkungan:     'https://esgnow.republika.co.id',
  esg:            'https://esgnow.republika.co.id',

  // Opini & Analisis
  opini:          'https://analisis.republika.co.id/kolom',
  kolom:          'https://analisis.republika.co.id/kolom',
  analisis:       'https://analisis.republika.co.id',

  // Otomotif
  otomotif:       'https://ekonomi.republika.co.id/otomotif',
};

// Subdomain → label kategori
const SUBDOMAIN_CATEGORY = {
  news:         'nasional',
  ekonomi:      'ekonomi',
  sport:        'olahraga',
  internasional:'internasional',
  tekno:        'teknologi',
  khazanah:     'islam',
  sharia:       'ekonomi syariah',
  analisis:     'opini',
  ameera:       'gaya hidup',
  esgnow:       'lingkungan',
  islamdigest:  'islam digest',
  visual:       'visual',
  tv:           'video',
};

// Keyword → subdomain relevan
const KEYWORD_CATEGORY_MAP = {
  dolar:        ['ekonomi'],
  rupiah:       ['ekonomi'],
  saham:        ['ekonomi'],
  ihsg:         ['ekonomi'],
  inflasi:      ['ekonomi'],
  pajak:        ['ekonomi', 'nasional'],
  apbn:         ['ekonomi', 'nasional'],
  anggaran:     ['ekonomi', 'nasional'],
  bumn:         ['ekonomi', 'nasional'],
  pemilu:       ['nasional'],
  presiden:     ['nasional'],
  prabowo:      ['nasional'],
  dpr:          ['nasional'],
  korupsi:      ['nasional'],
  kpk:          ['nasional'],
  polri:        ['nasional'],
  mahkamah:     ['nasional'],
  covid:        ['nasional', 'ekonomi'],
  vaksin:       ['nasional'],
  timnas:       ['sport'],
  liga:         ['sport'],
  piala:        ['sport'],
  badminton:    ['sport'],
  motogp:       ['sport'],
  iphone:       ['teknologi'],
  android:      ['teknologi'],
  ai:           ['teknologi'],
  startup:      ['teknologi', 'ekonomi'],
  ramadhan:     ['khazanah'],
  haji:         ['khazanah'],
  quran:        ['khazanah'],
  zakat:        ['syariah'],
  sukuk:        ['syariah'],
  syariah:      ['syariah'],
  fashion:      ['ameera'],
  halal:        ['ameera'],
  israel:       ['internasional'],
  perang:       ['internasional', 'nasional'],
  gempa:        ['nasional'],
  banjir:       ['nasional'],
  lingkungan:   ['esgnow'],
  iklim:        ['esgnow'],
};

// ── Utilitas ───────────────────────────────────────────────────────────────

const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const sleep    = ms  => new Promise(r => setTimeout(r, ms));

/**
 * Ambil kategori dari URL artikel Republika.
 * Dari subdomain hostname.
 * Contoh: news.republika.co.id → 'nasional'
 */
function categoryFromUrl(url) {
  try {
    const subdomain = new URL(url).hostname.split('.')[0];
    return SUBDOMAIN_CATEGORY[subdomain] || subdomain || 'umum';
  } catch { return 'umum'; }
}

/**
 * Validasi URL artikel Republika.
 * Pola wajib: .republika.co.id/berita/<id>/<slug>
 * ID artikel adalah alphanumeric ~13 karakter.
 */
function isRepublikaArticleUrl(href) {
  if (!href || !href.startsWith('http')) return false;
  if (!href.includes('republika.co.id')) return false;
  if (!href.includes('/berita/')) return false;

  const excludes = [
    '/tag/', '/indeks', '/page/', '/kanal/', '/search',
    '/foto/', '/video/', '/infografis/', '/komik/', '/karikatur/',
    '#', 'javascript:', 'tv.republika', 'retizen.id',
    'republika.id', 'skor.id',
  ];
  if (excludes.some(ex => href.includes(ex))) return false;

  try {
    const { pathname } = new URL(href);
    const segments = pathname.split('/').filter(Boolean);
    // /berita/<id>/<slug> → minimal 3 segmen
    return segments.length >= 3 && segments[0] === 'berita';
  } catch { return false; }
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
          'Referer':         'https://republika.co.id/',
        },
        timeout: 25000,
        maxRedirects: 5,
      });
      return cheerio.load(res.data);
    } catch (err) {
      const status = err.response?.status;
      console.warn(`[Republika] Attempt ${attempt}/${retries} gagal untuk ${url}: ${err.message}`);
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
      $('h1.title').first().text().trim() ||
      $('h1[itemprop="headline"]').first().text().trim() ||
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim();

    // ── Konten ──
    const contentSelectors = [
      'div.artikel-konten',
      'div#artikel-konten',
      'div[itemprop="articleBody"]',
      'div.article-content',
      'div.detail-content',
      'div.content-detail',
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
        'noscript', '.share-button', '.tag-list',
        '.embed', '.iklan', '.box-ads',
      ].join(',')).remove();
      content = contentEl.text().replace(/\s+/g, ' ').trim();
    }

    // Fallback paragraf
    if (!content || content.length < 80) {
      const parts = [];
      $('p').each((_, el) => {
        const inNav = $(el).parents('nav, footer, aside, header, .sidebar').length;
        if (inNav > 0) return;
        const t = $(el).text().trim();
        if (t.length > 40) parts.push(t);
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

    // Fallback teks tanggal — format "Jumat, 06 June 2026, 05:45 WIB"
    if (!published_date) {
      const dateText =
        $('span.date').first().text().trim() ||
        $('div.date').first().text().trim() ||
        $('[class*="date"]').first().text().trim();

      const MONTHS = {
        Januari:1, Februari:2, Maret:3, April:4, Mei:5, Juni:6,
        Juli:7, Agustus:8, September:9, Oktober:10, November:11, Desember:12,
        January:1, February:2, March:3, June:6, July:7, August:8,
        September:9, October:10, November:11, December:12,
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
      $('span.reporter').first().text().trim() ||
      $('div.reporter').first().text().trim() ||
      null;

    // ── Gambar & deskripsi ──
    const image_url   = $('meta[property="og:image"]').attr('content') || null;
    const description = $('meta[property="og:description"]').attr('content')?.trim() || null;

    // ── Validasi ──
    if (!title || title.length < 10) {
      console.warn(`[Republika] Skip (judul kosong): ${url}`);
      return null;
    }
    if (!content || content.length < 80) {
      if (description?.length > 50) {
        return {
          title, content: description, url, source: 'republika',
          published_date, author, image_url,
          category: categoryFromUrl(url),
        };
      }
      console.warn(`[Republika] Skip (konten kosong): ${url}`);
      return null;
    }

    return {
      title,
      content,
      url,
      source: 'republika',
      published_date,
      author: author || null,
      image_url,
      category: categoryFromUrl(url),
    };
  } catch (err) {
    console.error(`[Republika] Error parse ${url}:`, err.message);
    return null;
  }
}

// ── Kumpulkan URL dari halaman listing ────────────────────────────────────
// HTML statis — semua artikel langsung ada di DOM tanpa JS rendering

async function scrapeListingPage(pageUrl) {
  const $ = await fetchPage(pageUrl);
  const links = new Set();

  // Dari inspeksi HTML: artikel ada di <a href="...republika.co.id/berita/...">
  const selectors = [
    'a[href*="/berita/"]',       // selector utama — semua link berita
    'h2 a[href]',
    'h3 a[href]',
    'h4 a[href]',
    '.title a[href]',
    'article a[href]',
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr('href');
      if (isRepublikaArticleUrl(href)) links.add(href.split('?')[0]);
    });
  }

  return [...links];
}

// ── Scrape halaman indeks global ──────────────────────────────────────────
// republika.co.id/indeks/ — listing semua artikel terbaru

async function scrapeIndeks() {
  const indeksUrl = `${BASE_URL}/indeks/`;
  console.log(`[Republika] Scraping indeks global: ${indeksUrl}`);
  try {
    return await scrapeListingPage(indeksUrl);
  } catch (err) {
    console.warn(`[Republika] Indeks gagal: ${err.message}`);
    return [];
  }
}

// ── Scrape search ─────────────────────────────────────────────────────────

async function scrapeRepublikaSearch(query) {
  const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(query)}`;
  console.log(`[Republika] Scraping search: ${searchUrl}`);
  try {
    const urls = await scrapeListingPage(searchUrl);
    if (urls.length === 0) console.warn('[Republika] Search tidak menghasilkan URL.');
    return urls;
  } catch (err) {
    console.warn('[Republika] Search gagal:', err.message);
    return [];
  }
}

// ── Scrape tag page ───────────────────────────────────────────────────────

async function scrapeTagPage(query) {
  const slug   = query.toLowerCase().replace(/\s+/g, '-');
  const tagUrl = `${BASE_URL}/tag/${encodeURIComponent(slug)}`;
  console.log(`[Republika] Scraping tag: ${tagUrl}`);
  try {
    return await scrapeListingPage(tagUrl);
  } catch (err) {
    console.warn(`[Republika] Tag page gagal:`, err.message);
    return [];
  }
}

// ── Tentukan subdomain relevan dari keyword ───────────────────────────────

function guessCategories(query) {
  const q = query.toLowerCase();
  for (const [kw, cats] of Object.entries(KEYWORD_CATEGORY_MAP)) {
    if (q.includes(kw)) return cats;
  }
  return ['nasional', 'ekonomi'];
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
 * Scrape artikel dari Republika.co.id
 *
 * @param {string}  query        - Kata kunci atau nama kategori
 * @param {number}  maxArticles  - Default 5
 * @param {string}  dateFrom     - ISO date (opsional)
 * @param {string}  dateTo       - ISO date (opsional)
 */
export async function scrapeRepublika(query, maxArticles = 5, dateFrom, dateTo) {
  try {
    const qLower = query ? query.toLowerCase().trim() : '';
    let urls = [];

    if (!query) {
      // Tidak ada query → indeks global (paling reliabel)
      console.log('[Republika] Scraping indeks global...');
      urls = await scrapeIndeks();

    } else if (CATEGORY_URLS[qLower] && !dateFrom && !dateTo) {
      // Query cocok dengan nama kanal/kategori
      const catUrl = CATEGORY_URLS[qLower];
      console.log(`[Republika] Scraping kanal: ${catUrl}`);
      urls = await scrapeListingPage(catUrl);

    } else {
      // Query bebas — coba berurutan

      // Strategi 1: Search
      urls = await scrapeRepublikaSearch(query);

      // Strategi 2: Tag page
      if (urls.length === 0) {
        urls = await scrapeTagPage(query);
      }

      // Strategi 3: Scrape kanal relevan paralel
      if (urls.length === 0) {
        const cats = guessCategories(qLower);
        console.log(`[Republika] Fallback kanal relevan: ${cats.join(', ')}`);
        const results = await Promise.all(
          cats.map(c => {
            const catUrl = CATEGORY_URLS[c];
            return catUrl
              ? scrapeListingPage(catUrl).catch(() => [])
              : Promise.resolve([]);
          })
        );
        urls = [...new Set(results.flat())];
      }

      // Strategi 4: Indeks global sebagai last resort
      if (urls.length === 0) {
        console.log('[Republika] Last resort: indeks global...');
        urls = await scrapeIndeks();
      }
    }

    // Dedup & batasi
    urls = [...new Set(urls)].slice(0, maxArticles * 3);
    console.log(`[Republika] URLs ditemukan: ${urls.length}, mulai parse...`);

    const articles = [];
    for (const url of urls) {
      if (articles.length >= maxArticles) break;
      const art = await parseArticle(url);
      if (art) {
        articles.push(art);
        console.log(`[Republika] ✅ ${art.title.substring(0, 70)}`);
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
    console.log(`[Republika] Total artikel dikembalikan: ${result.length}`);
    return result;

  } catch (err) {
    console.error('[Republika] Scraping gagal:', err.message);
    return [];
  }
}