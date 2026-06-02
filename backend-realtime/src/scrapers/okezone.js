/**
 * okezone.js - Realtime scraper untuk Okezone.com
 *
 * Rekomendasi sebagai platform ke-10 karena:
 * - Ranking #8 media online Indonesia (Similarweb Maret 2026)
 * - Portal MNC Group terintegrasi (RCTI, GTV, MNC TV, iNews)
 * - Cakupan berita general: nasional, ekonomi, olahraga, lifestyle, selebriti
 * - Saudara satu grup dengan Sindonews (MNC Group)
 * - Struktur HTML yang bersih dan konsisten
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KARAKTERISTIK UNIK OKEZONE:
 *
 * 1. ARSITEKTUR SUBDOMAIN PER KATEGORI (mirip Sindonews tapi skema berbeda):
 *    news.okezone.com      → Nasional & Politik
 *    economy.okezone.com   → Ekonomi & Bisnis
 *    sports.okezone.com    → Olahraga umum
 *    bola.okezone.com      → Sepakbola khusus
 *    techno.okezone.com    → Teknologi & Gadget
 *    celebrity.okezone.com → Hiburan & Selebriti
 *    lifestyle.okezone.com → Gaya Hidup
 *    otomotif.okezone.com  → Otomotif
 *    travel.okezone.com    → Wisata
 *    women.okezone.com     → Perempuan & Keluarga
 *    health.okezone.com    → Kesehatan
 *    muslim.okezone.com    → Islami
 *
 * 2. POLA URL ARTIKEL — mengandung tanggal lengkap di path (UNIK):
 *    <subdomain>.okezone.com/read/<YYYY>/<MM>/<DD>/<subcat-id>/<article-id>/<slug>
 *    Contoh:
 *      economy.okezone.com/read/2026/06/01/320/3221859/prabowo-mari-kita-jujur...
 *      news.okezone.com/read/2026/05/28/337/3219876/judul-berita-nasional
 *      bola.okezone.com/read/2026/06/01/52/3221901/timnas-indonesia-vs-myanmar
 *    Format: /read/<tahun>/<bulan>/<hari>/<subkategori-id>/<article-id>/<slug>
 *    → Tanggal artikel bisa diparse LANGSUNG dari URL path! (seperti CNBC)
 *
 * 3. HALAMAN INDEKS PER SUBDOMAIN:
 *    <subdomain>.okezone.com/indeks → listing statis, paling reliabel ✅
 *
 * 4. TAG PAGE:
 *    www.okezone.com/tag/<slug> — aktif ✅
 *
 * 5. SEARCH:
 *    www.okezone.com/search/<query> — path-based (mirip Sindonews) ✅
 * ═══════════════════════════════════════════════════════════════════════════
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// ── Konstanta ──────────────────────────────────────────────────────────────

const BASE_URL  = 'https://www.okezone.com';
const DELAY_MS  = parseInt(process.env.SCRAPE_DELAY_MS || '600');
const MAX_RETRY = 2;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

// ── Subdomain kategori — diverifikasi Mei 2026 ────────────────────────────

const CATEGORY_URLS = {
  // Nasional & Politik
  news:           'https://news.okezone.com',
  nasional:       'https://news.okezone.com',
  politik:        'https://news.okezone.com',
  hukum:          'https://news.okezone.com',
  peristiwa:      'https://news.okezone.com',

  // Ekonomi & Bisnis
  economy:        'https://economy.okezone.com',
  ekonomi:        'https://economy.okezone.com',
  bisnis:         'https://economy.okezone.com',
  keuangan:       'https://economy.okezone.com',

  // Olahraga
  sports:         'https://sports.okezone.com',
  olahraga:       'https://sports.okezone.com',
  sport:          'https://sports.okezone.com',
  bola:           'https://bola.okezone.com',
  sepakbola:      'https://bola.okezone.com',
  timnas:         'https://bola.okezone.com',

  // Teknologi
  techno:         'https://techno.okezone.com',
  teknologi:      'https://techno.okezone.com',
  tekno:          'https://techno.okezone.com',
  gadget:         'https://techno.okezone.com',

  // Hiburan & Selebriti
  celebrity:      'https://celebrity.okezone.com',
  hiburan:        'https://celebrity.okezone.com',
  seleb:          'https://celebrity.okezone.com',
  selebriti:      'https://celebrity.okezone.com',
  film:           'https://celebrity.okezone.com',
  musik:          'https://celebrity.okezone.com',

  // Gaya Hidup
  lifestyle:      'https://lifestyle.okezone.com',
  'gaya hidup':   'https://lifestyle.okezone.com',
  gaya:           'https://lifestyle.okezone.com',
  travel:         'https://travel.okezone.com',
  wisata:         'https://travel.okezone.com',
  kuliner:        'https://lifestyle.okezone.com',

  // Lainnya
  otomotif:       'https://otomotif.okezone.com',
  kesehatan:      'https://health.okezone.com',
  health:         'https://health.okezone.com',
  women:          'https://women.okezone.com',
  perempuan:      'https://women.okezone.com',
  muslim:         'https://muslim.okezone.com',
  islami:         'https://muslim.okezone.com',
};

// Subdomain → label kategori
const SUBDOMAIN_CATEGORY = {
  news:       'nasional',
  economy:    'ekonomi',
  sports:     'olahraga',
  bola:       'olahraga',
  techno:     'teknologi',
  celebrity:  'hiburan',
  lifestyle:  'gaya hidup',
  travel:     'travel',
  otomotif:   'otomotif',
  health:     'kesehatan',
  women:      'gaya hidup',
  muslim:     'islami',
  www:        'umum',
};

// Keyword → subdomain relevan
const KEYWORD_CATEGORY_MAP = {
  dolar:        ['economy'],
  rupiah:       ['economy'],
  saham:        ['economy'],
  ihsg:         ['economy'],
  inflasi:      ['economy'],
  pajak:        ['economy', 'news'],
  anggaran:     ['economy', 'news'],
  bumn:         ['economy', 'news'],
  pemilu:       ['news'],
  presiden:     ['news'],
  prabowo:      ['news'],
  korupsi:      ['news'],
  kpk:          ['news'],
  polri:        ['news'],
  tni:          ['news'],
  covid:        ['health', 'news'],
  vaksin:       ['health'],
  kanker:       ['health'],
  diet:         ['health', 'lifestyle'],
  liga:         ['bola'],
  timnas:       ['bola'],
  persija:      ['bola'],
  motogp:       ['sports'],
  bulutangkis:  ['sports'],
  badminton:    ['sports'],
  iphone:       ['techno'],
  android:      ['techno'],
  laptop:       ['techno'],
  ai:           ['techno'],
  startup:      ['techno', 'economy'],
  artis:        ['celebrity'],
  drakor:       ['celebrity'],
  film:         ['celebrity'],
  fashion:      ['lifestyle'],
  wisata:       ['travel'],
  kuliner:      ['lifestyle'],
  israel:       ['news'],
  perang:       ['news'],
  gempa:        ['news'],
  banjir:       ['news'],
};

// ── Utilitas ───────────────────────────────────────────────────────────────

const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const sleep    = ms  => new Promise(r => setTimeout(r, ms));

/**
 * Ambil kategori dari URL artikel Okezone.
 * Subdomain selalu ada di hostname.
 * Contoh: economy.okezone.com → 'ekonomi'
 */
function categoryFromUrl(url) {
  try {
    const subdomain = new URL(url).hostname.split('.')[0];
    return SUBDOMAIN_CATEGORY[subdomain] || subdomain || 'umum';
  } catch {
    return 'umum';
  }
}

/**
 * Ekstrak tanggal publish LANGSUNG dari URL artikel Okezone.
 * Pola: /read/<YYYY>/<MM>/<DD>/<subcat>/<id>/<slug>
 * Contoh: /read/2026/06/01/320/3221859/... → 2026-06-01
 *
 * Lebih reliabel dari meta tag.
 */
function dateFromUrl(url) {
  try {
    const { pathname } = new URL(url);
    // Pola: /read/YYYY/MM/DD/...
    const match = pathname.match(/\/read\/(\d{4})\/(\d{2})\/(\d{2})\//);
    if (!match) return null;
    const d = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00+07:00`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Validasi URL artikel Okezone.
 * Pola wajib: /read/<YYYY>/<MM>/<DD>/<subcat-id>/<article-id>/<slug>
 */
function isOkezoneArticleUrl(href) {
  if (!href || !href.startsWith('http')) return false;
  if (!href.includes('okezone.com')) return false;

  const excludes = [
    '/tag/', '/search', '/indeks', '/video/', '/foto/',
    '/about', '/redaksi', '/advertise', '#', 'javascript:',
    '/live', '/podcast/', '/epaper',
  ];
  if (excludes.some(ex => href.includes(ex))) return false;

  try {
    const { pathname } = new URL(href);
    // Harus mengandung /read/ dan pola tanggal YYYY/MM/DD
    return /\/read\/\d{4}\/\d{2}\/\d{2}\/\d+\/\d+\//.test(pathname);
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
          'Referer':         'https://www.okezone.com/',
        },
        timeout: 25000,
        maxRedirects: 5,
      });
      return cheerio.load(res.data);
    } catch (err) {
      const status = err.response?.status;
      console.warn(`[Okezone] Attempt ${attempt}/${retries} gagal untuk ${url}: ${err.message}`);
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
      $('h1.detail-title').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('h1').first().text().trim();

    // ── Konten ──
    // Okezone: div#contentArticle atau div[itemprop="articleBody"]
    const contentSelectors = [
      'div#contentArticle',
      'div[itemprop="articleBody"]',
      'div.detail-text',
      'div.article-content',
      'div#article-content',
      'div.content',
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
        '.embed-placeholder', '.banner',
      ].join(',')).remove();
      content = contentEl.text().replace(/\s+/g, ' ').trim();
    }

    // Fallback: kumpulkan paragraf
    if (!content || content.length < 80) {
      const parts = [];
      $('div#contentArticle p, div[itemprop="articleBody"] p, article p').each((_, el) => {
        const t = $(el).text().trim();
        if (t.length > 30) parts.push(t);
      });
      content = parts.join(' ').trim();
    }

    // ── Tanggal — prioritaskan parse dari URL (tanggal ada di path) ──
    let published_date = dateFromUrl(url);

    // Fallback ke meta tag
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

    // Fallback teks tanggal — format "Senin, 1 Juni 2026 10:30 WIB"
    if (!published_date) {
      const dateText =
        $('span.date').first().text().trim() ||
        $('div.date-detail').first().text().trim() ||
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
      $('span.reporter').first().text().trim() ||
      $('a.author').first().text().trim() ||
      null;

    // ── Gambar & deskripsi ──
    const image_url   = $('meta[property="og:image"]').attr('content') || null;
    const description = $('meta[property="og:description"]').attr('content')?.trim() || null;

    // ── Validasi ──
    if (!title || title.length < 10) {
      console.warn(`[Okezone] Skip (judul kosong): ${url}`);
      return null;
    }
    if (!content || content.length < 80) {
      if (description?.length > 50) {
        return {
          title, content: description, url, source: 'okezone',
          published_date, author, image_url,
          category: categoryFromUrl(url),
        };
      }
      console.warn(`[Okezone] Skip (konten kosong): ${url}`);
      return null;
    }

    return {
      title,
      content,
      url,
      source: 'okezone',
      published_date,
      author: author || null,
      image_url,
      category: categoryFromUrl(url),
    };
  } catch (err) {
    console.error(`[Okezone] Error parse ${url}:`, err.message);
    return null;
  }
}

// ── Kumpulkan URL dari halaman listing ────────────────────────────────────

async function scrapeListingPage(pageUrl) {
  const $ = await fetchPage(pageUrl);
  const links = new Set();

  const selectors = [
    'h4.ftitle a',
    'h3.ftitle a',
    'h2.ftitle a',
    '.news-list h4 a',
    '.news-list h3 a',
    'article h3 a',
    'article h4 a',
    '.list-content h4 a',
    '.list-content h3 a',
    'a[href*="/read/"]',    // fallback lebar
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr('href');
      if (isOkezoneArticleUrl(href)) links.add(href.split('?')[0]);
    });
  }

  return [...links];
}

// ── Scrape indeks subdomain (listing statis paling reliabel) ──────────────

async function scrapeIndeksPage(subdomainUrl) {
  const indeksUrl = `${subdomainUrl}/indeks`;
  console.log(`[Okezone] Scraping indeks: ${indeksUrl}`);
  try {
    return await scrapeListingPage(indeksUrl);
  } catch (err) {
    console.warn(`[Okezone] Indeks gagal, coba halaman utama: ${err.message}`);
    return scrapeListingPage(subdomainUrl).catch(() => []);
  }
}

// ── Scrape search ─────────────────────────────────────────────────────────
// Okezone menggunakan path-based search: /search/<query>

async function scrapeOkezoneSearch(query) {
  const searchUrl = `${BASE_URL}/search/${encodeURIComponent(query.replace(/\s+/g, '+'))}`;
  console.log(`[Okezone] Scraping search: ${searchUrl}`);
  try {
    const urls = await scrapeListingPage(searchUrl);
    if (urls.length === 0) console.warn('[Okezone] Search tidak menghasilkan URL.');
    return urls;
  } catch (err) {
    console.warn('[Okezone] Search gagal:', err.message);
    return [];
  }
}

// ── Scrape tag page ───────────────────────────────────────────────────────

async function scrapeTagPage(query) {
  const slug   = query.toLowerCase().replace(/\s+/g, '-');
  const tagUrl = `${BASE_URL}/tag/${encodeURIComponent(slug)}`;
  console.log(`[Okezone] Scraping tag: ${tagUrl}`);
  try {
    return await scrapeListingPage(tagUrl);
  } catch (err) {
    console.warn(`[Okezone] Tag page gagal (${slug}):`, err.message);
    return [];
  }
}

// ── Tentukan subdomain relevan dari keyword ───────────────────────────────

function guessSubdomains(query) {
  const q = query.toLowerCase();
  for (const [kw, subs] of Object.entries(KEYWORD_CATEGORY_MAP)) {
    if (q.includes(kw)) {
      return subs.map(s => CATEGORY_URLS[s] || `https://${s}.okezone.com`);
    }
  }
  return [CATEGORY_URLS.news, CATEGORY_URLS.economy];
}

// ── Pre-filter URL berdasarkan tanggal dari path ───────────────────────────

function isUrlInDateRange(url, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const pubDate = dateFromUrl(url);
  if (!pubDate) return true;
  const pub = new Date(pubDate);
  if (dateFrom && pub < new Date(dateFrom)) return false;
  if (dateTo   && pub > new Date(dateTo))   return false;
  return true;
}

// ── Filter tanggal post-parse ─────────────────────────────────────────────

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
 * Scrape artikel dari Okezone.com
 *
 * @param {string}  query        - Kata kunci atau nama kategori
 * @param {number}  maxArticles  - Default 5
 * @param {string}  dateFrom     - ISO date (opsional)
 * @param {string}  dateTo       - ISO date (opsional)
 */
export async function scrapeOkezone(query, maxArticles = 5, dateFrom, dateTo) {
  try {
    const qLower = query ? query.toLowerCase().trim() : '';
    let urls = [];

    if (!query) {
      // Tidak ada query → indeks news
      console.log('[Okezone] Scraping indeks news...');
      urls = await scrapeIndeksPage(CATEGORY_URLS.news);

    } else if (CATEGORY_URLS[qLower] && !dateFrom && !dateTo) {
      // Query cocok dengan nama kategori
      const subUrl = CATEGORY_URLS[qLower];
      console.log(`[Okezone] Scraping indeks: ${subUrl}`);
      urls = await scrapeIndeksPage(subUrl);

    } else {
      // Query bebas — coba berurutan

      // Strategi 1: Search
      urls = await scrapeOkezoneSearch(query);

      // Strategi 2: Tag page
      if (urls.length === 0) {
        urls = await scrapeTagPage(query);
      }

      // Strategi 3: Indeks subdomain relevan
      if (urls.length === 0) {
        const subUrls = guessSubdomains(qLower);
        console.log(`[Okezone] Fallback indeks subdomain: ${subUrls.join(', ')}`);
        const results = await Promise.all(
          subUrls.map(su => scrapeIndeksPage(su).catch(() => []))
        );
        urls = [...new Set(results.flat())];
      }
    }

    // Dedup + pre-filter tanggal dari URL (optimasi: skip fetch artikel di luar range)
    urls = [...new Set(urls)]
      .filter(u => isUrlInDateRange(u, dateFrom, dateTo))
      .slice(0, maxArticles * 3);

    console.log(`[Okezone] URLs ditemukan: ${urls.length}, mulai parse...`);

    const articles = [];
    for (const url of urls) {
      if (articles.length >= maxArticles) break;
      const art = await parseArticle(url);
      if (art) {
        articles.push(art);
        console.log(`[Okezone] ✅ ${art.title.substring(0, 70)}`);
      }
    }

    // Filter tanggal post-parse
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
    console.log(`[Okezone] Total artikel dikembalikan: ${result.length}`);
    return result;

  } catch (err) {
    console.error('[Okezone] Scraping gagal:', err.message);
    return [];
  }
}