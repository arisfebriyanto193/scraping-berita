
/**
 * sindo.js - Realtime scraper untuk SINDOnews.com
 *
 * Karakteristik UNIK Sindonews — BERBEDA dari semua platform sebelumnya:
 *
 * 1. ARSITEKTUR SUBDOMAIN PER KATEGORI (bukan path):
 *    Setiap kategori punya subdomain sendiri:
 *      nasional.sindonews.com   → Politik, Hukum, Hankam, Sosial
 *      ekbis.sindonews.com      → Ekonomi & Bisnis
 *      sports.sindonews.com     → Olahraga & Bola
 *      international.sindonews.com → Berita Mancanegara
 *      lifestyle.sindonews.com  → Gaya Hidup
 *      tekno.sindonews.com      → Teknologi
 *      otomotif.sindonews.com   → Otomotif
 *      edukasi.sindonews.com    → Pendidikan
 *      daerah.sindonews.com     → Berita Daerah/Regional
 *      kalam.sindonews.com      → Opini & Kolom
 *
 * 2. POLA URL ARTIKEL — unik dengan timestamp epoch:
 *    <subdomain>.sindonews.com/read/<id>/<subkategori-id>/<slug>-<timestamp>
 *    Contoh:
 *      nasional.sindonews.com/read/1701697/15/may-day-2026-...-1777475081
 *      ekbis.sindonews.com/read/1234567/34/judul-artikel-1234567890
 *    Pola: /read/ + angka ID + angka subkategori + slug + timestamp
 *
 * 3. HALAMAN INDEKS:
 *    sindonews.com/indeks → listing semua berita terbaru ✅
 *    <subdomain>.sindonews.com/indeks → per kategori ✅
 *
 * 4. TOPIC PAGE (bukan /tag/):
 *    sindonews.com/topic/<id>/<slug> — halaman topik berisi artikel terkait ✅
 *
 * 5. SEARCH:
 *    sindonews.com/search/<query> — format path, bukan query string ✅
 *
 * 6. SINDOscope (scope.sindonews.com) — subdomain khusus artikel analisis
 *    mendalam, struktur berbeda, dikecualikan dari scraper utama.
 *
 * 7. Sindonews adalah bagian MNC Group (RCTI, iNews, GTV, MNCTV).
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// ── Konstanta ──────────────────────────────────────────────────────────────

const BASE_URL   = 'https://www.sindonews.com';
const DELAY_MS   = parseInt(process.env.SCRAPE_DELAY_MS || '600');
const MAX_RETRY  = 2;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

// ── Subdomain kategori — diverifikasi Mei 2026 ────────────────────────────
// Format: { alias: subdomain_url }

const CATEGORY_URLS = {
  // Nasional & Politik
  nasional:       'https://nasional.sindonews.com',
  politik:        'https://nasional.sindonews.com/politik',
  hukum:          'https://nasional.sindonews.com/hukum',
  hankam:         'https://nasional.sindonews.com/hankam',

  // Ekonomi & Bisnis
  ekonomi:        'https://ekbis.sindonews.com',
  bisnis:         'https://ekbis.sindonews.com',
  ekbis:          'https://ekbis.sindonews.com',
  keuangan:       'https://ekbis.sindonews.com/makro',
  makro:          'https://ekbis.sindonews.com/makro',

  // Olahraga
  olahraga:       'https://sports.sindonews.com',
  sports:         'https://sports.sindonews.com',
  bola:           'https://sports.sindonews.com/bola',
  sepakbola:      'https://sports.sindonews.com/bola',
  motosport:      'https://sports.sindonews.com/motosport',

  // Internasional
  internasional:  'https://international.sindonews.com',
  dunia:          'https://international.sindonews.com',
  mancanegara:    'https://international.sindonews.com',
  'timur tengah': 'https://international.sindonews.com/timurtengah',
  'asia pasifik': 'https://international.sindonews.com/asiapasifik',

  // Gaya Hidup
  lifestyle:      'https://lifestyle.sindonews.com',
  'gaya hidup':   'https://lifestyle.sindonews.com',
  gaya:           'https://lifestyle.sindonews.com',

  // Teknologi
  teknologi:      'https://tekno.sindonews.com',
  tekno:          'https://tekno.sindonews.com',
  digital:        'https://tekno.sindonews.com',

  // Lainnya
  otomotif:       'https://otomotif.sindonews.com',
  pendidikan:     'https://edukasi.sindonews.com',
  edukasi:        'https://edukasi.sindonews.com',
  daerah:         'https://daerah.sindonews.com',
  regional:       'https://daerah.sindonews.com',
  opini:          'https://kalam.sindonews.com',
  kolom:          'https://kalam.sindonews.com',
  kalam:          'https://kalam.sindonews.com',
};

// Subdomain → label kategori
const SUBDOMAIN_CATEGORY = {
  nasional:       'nasional',
  ekbis:          'ekonomi',
  sports:         'olahraga',
  international:  'internasional',
  lifestyle:      'gaya hidup',
  tekno:          'teknologi',
  otomotif:       'otomotif',
  edukasi:        'pendidikan',
  daerah:         'regional',
  kalam:          'opini',
  scope:          'analisis',
  www:            'umum',
};

// Keyword → subdomain relevan
const KEYWORD_CATEGORY_MAP = {
  dolar:        ['ekbis'],
  rupiah:       ['ekbis'],
  saham:        ['ekbis'],
  ihsg:         ['ekbis'],
  inflasi:      ['ekbis'],
  pajak:        ['ekbis', 'nasional'],
  anggaran:     ['ekbis', 'nasional'],
  apbn:         ['ekbis', 'nasional'],
  pemilu:       ['nasional'],
  presiden:     ['nasional'],
  prabowo:      ['nasional'],
  dpr:          ['nasional'],
  korupsi:      ['nasional'],
  kpk:          ['nasional'],
  polri:        ['nasional'],
  covid:        ['lifestyle', 'nasional'],
  vaksin:       ['lifestyle'],
  timnas:       ['sports'],
  liga:         ['sports'],
  bola:         ['sports'],
  motogp:       ['sports'],
  f1:           ['sports'],
  ai:           ['tekno'],
  iphone:       ['tekno'],
  smartphone:   ['tekno'],
  laptop:       ['tekno'],
  startup:      ['tekno', 'ekbis'],
  fashion:      ['lifestyle'],
  kuliner:      ['lifestyle'],
  wisata:       ['lifestyle'],
  israel:       ['international'],
  iran:         ['international'],
  perang:       ['international', 'nasional'],
  china:        ['international', 'ekbis'],
  gempa:        ['nasional', 'daerah'],
  banjir:       ['nasional', 'daerah'],
};

// ── Utilitas ───────────────────────────────────────────────────────────────

const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const sleep    = ms  => new Promise(r => setTimeout(r, ms));

/**
 * Ambil kategori dari URL artikel Sindo.
 * Ambil dari subdomain hostname.
 * Contoh: nasional.sindonews.com → 'nasional'
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
 * Validasi URL artikel Sindonews.
 * Pola: <subdomain>.sindonews.com/read/<id>/<subcat-id>/<slug>
 * Semua artikel mengandung /read/ dan dua angka berurutan di path.
 */
function isSindoArticleUrl(href) {
  if (!href || !href.startsWith('http')) return false;
  if (!href.includes('sindonews.com')) return false;

  const excludes = [
    '/topic/', '/search', '/indeks', '/about', '/redaksi',
    '/tag/', '/video/', '/foto/', '/infografis/', '#', 'javascript:',
    'scope.sindonews.com',   // SINDOscope — format berbeda
  ];
  if (excludes.some(ex => href.includes(ex))) return false;

  try {
    const { pathname } = new URL(href);
    // Harus ada /read/ dan minimal dua segmen numerik
    return pathname.includes('/read/') && /\/read\/\d+\/\d+\//.test(pathname);
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
          'Referer':         'https://www.sindonews.com/',
        },
        timeout: 25000,
        maxRedirects: 5,
      });
      return cheerio.load(res.data);
    } catch (err) {
      const status = err.response?.status;
      console.warn(`[Sindo] Attempt ${attempt}/${retries} gagal untuk ${url}: ${err.message}`);
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
      $('h1.title').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('h1').first().text().trim();

    // ── Konten ──
    // Sindonews: div.detail-desc atau div[itemprop="articleBody"]
    const contentSelectors = [
      'div.detail-desc',
      'div[itemprop="articleBody"]',
      'div.article-content',
      'div.content-detail',
      'div.detail-text',
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
        'noscript', '.social-share', '.tags-article',
        '.banner', '.iklan',
      ].join(',')).remove();
      content = contentEl.text().replace(/\s+/g, ' ').trim();
    }

    // Fallback paragraf
    if (!content || content.length < 80) {
      const parts = [];
      $('div.detail-desc p, div[itemprop="articleBody"] p, article p').each((_, el) => {
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

    // Fallback: teks tanggal — format "28 Mei 2026 - 20:56 WIB"
    if (!published_date) {
      const dateText =
        $('span.detail-date').text().trim() ||
        $('div.detail-info span').first().text().trim() ||
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

    // Fallback terakhir: ekstrak timestamp dari URL artikel itu sendiri
    // Pola slug: ...-<unix_timestamp> di akhir URL
    if (!published_date) {
      const tsMatch = url.match(/-(\d{10})(?:\?|$)/);
      if (tsMatch) {
        const ts = parseInt(tsMatch[1]) * 1000;
        const d  = new Date(ts);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2020) {
          published_date = d.toISOString();
        }
      }
    }

    // ── Penulis ──
    const author =
      $('[itemprop="author"]').first().text().trim() ||
      $('meta[name="author"]').attr('content')?.trim() ||
      $('span.detail-author').first().text().trim() ||
      $('a.author-name').first().text().trim() ||
      null;

    // ── Gambar & deskripsi ──
    const image_url   = $('meta[property="og:image"]').attr('content') || null;
    const description = $('meta[property="og:description"]').attr('content')?.trim() || null;

    // ── Validasi ──
    if (!title || title.length < 10) {
      console.warn(`[Sindo] Skip (judul kosong): ${url}`);
      return null;
    }
    if (!content || content.length < 80) {
      if (description?.length > 50) {
        return {
          title, content: description, url, source: 'sindonews',
          published_date, author, image_url,
          category: categoryFromUrl(url),
        };
      }
      console.warn(`[Sindo] Skip (konten kosong): ${url}`);
      return null;
    }

    return {
      title,
      content,
      url,
      source: 'sindonews',
      published_date,
      author: author || null,
      image_url,
      category: categoryFromUrl(url),
    };
  } catch (err) {
    console.error(`[Sindo] Error parse ${url}:`, err.message);
    return null;
  }
}

// ── Kumpulkan URL dari halaman listing ────────────────────────────────────

async function scrapeListingPage(pageUrl) {
  const $ = await fetchPage(pageUrl);
  const links = new Set();

  // Sindonews listing menggunakan beragam selector tergantung subdomain
  const selectors = [
    'h2.title a',
    'h3.title a',
    'h4.title a',
    'a.title',
    '.headline h2 a',
    '.headline h3 a',
    '.card-news h3 a',
    '.list-berita h3 a',
    'article h2 a',
    'article h3 a',
    'a[href*="/read/"]',    // fallback lebar
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr('href');
      if (isSindoArticleUrl(href)) links.add(href.split('?')[0]);
    });
  }

  return [...links];
}

// ── Scrape halaman indeks ─────────────────────────────────────────────────
// sindonews.com/indeks dan <subdomain>.sindonews.com/indeks
// adalah listing HTML statis yang reliabel

async function scrapeIndeksPage(baseUrl) {
  const indeksUrl = `${baseUrl}/indeks`;
  console.log(`[Sindo] Scraping indeks: ${indeksUrl}`);
  try {
    return await scrapeListingPage(indeksUrl);
  } catch (err) {
    console.warn(`[Sindo] Indeks gagal, coba halaman utama: ${err.message}`);
    return scrapeListingPage(baseUrl).catch(() => []);
  }
}

// ── Scrape search Sindonews ───────────────────────────────────────────────
// Sindonews menggunakan path-based search: /search/<query>

async function scrapeSindoSearch(query) {
  // Format search Sindo: /search/<slug-query>
  const slug      = encodeURIComponent(query.toLowerCase().replace(/\s+/g, '+'));
  const searchUrl = `${BASE_URL}/search/${slug}`;
  console.log(`[Sindo] Scraping search: ${searchUrl}`);
  try {
    const urls = await scrapeListingPage(searchUrl);
    if (urls.length === 0) {
      console.warn('[Sindo] Search tidak menghasilkan URL.');
    }
    return urls;
  } catch (err) {
    console.warn('[Sindo] Search gagal:', err.message);
    return [];
  }
}

// ── Scrape topic page ─────────────────────────────────────────────────────
// sindonews.com/topic/<id>/<slug> — lebih akurat dari search untuk topik tertentu

async function scrapeTopicPage(query) {
  // Cari topic yang cocok via search page dulu untuk dapat ID-nya
  // Fallback: gunakan URL konstruksi langsung dengan slug
  const slug     = query.toLowerCase().replace(/\s+/g, '-');
  const topicUrl = `${BASE_URL}/topic/search/${encodeURIComponent(query)}`;
  console.log(`[Sindo] Scraping topic search: ${topicUrl}`);
  try {
    return await scrapeListingPage(topicUrl);
  } catch {
    return [];
  }
}

// ── Tentukan subdomain relevan dari keyword ───────────────────────────────

function guessCategories(query) {
  const q = query.toLowerCase();
  for (const [kw, cats] of Object.entries(KEYWORD_CATEGORY_MAP)) {
    if (q.includes(kw)) {
      return cats.map(c => CATEGORY_URLS[c] || `https://${c}.sindonews.com`);
    }
  }
  return [CATEGORY_URLS.nasional, CATEGORY_URLS.ekonomi];
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
 * Scrape artikel dari SINDOnews.com
 *
 * @param {string}  query        - Kata kunci atau nama kategori
 * @param {number}  maxArticles  - Default 5
 * @param {string}  dateFrom     - ISO date (opsional)
 * @param {string}  dateTo       - ISO date (opsional)
 */
export async function scrapeSindo(query, maxArticles = 5, dateFrom, dateTo) {
  try {
    const qLower = query ? query.toLowerCase().trim() : '';
    let urls = [];

    if (!query) {
      // Tidak ada query → indeks utama sindonews.com
      console.log('[Sindo] Scraping indeks utama...');
      urls = await scrapeIndeksPage(BASE_URL);

    } else if (CATEGORY_URLS[qLower] && !dateFrom && !dateTo) {
      // Query cocok dengan nama kategori — gunakan indeks subdomain
      const catUrl = CATEGORY_URLS[qLower];
      console.log(`[Sindo] Scraping indeks kategori: ${catUrl}`);
      urls = await scrapeIndeksPage(catUrl);

    } else {
      // Query bebas — coba berurutan

      // Strategi 1: Search path-based
      urls = await scrapeSindoSearch(query);

      // Strategi 2: Topic search
      if (urls.length === 0) {
        urls = await scrapeTopicPage(query);
      }

      // Strategi 3: Scrape indeks subdomain relevan
      if (urls.length === 0) {
        const catUrls = guessCategories(qLower);
        console.log(`[Sindo] Fallback indeks subdomain: ${catUrls.join(', ')}`);
        const results = await Promise.all(
          catUrls.map(cu => scrapeIndeksPage(cu).catch(() => []))
        );
        urls = [...new Set(results.flat())];
      }
    }

    // Dedup & batasi
    urls = [...new Set(urls)].slice(0, maxArticles * 3);
    console.log(`[Sindo] URLs ditemukan: ${urls.length}, mulai parse...`);

    const articles = [];
    for (const url of urls) {
      if (articles.length >= maxArticles) break;
      const art = await parseArticle(url);
      if (art) {
        articles.push(art);
        console.log(`[Sindo] ✅ ${art.title.substring(0, 70)}`);
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
    console.log(`[Sindo] Total artikel dikembalikan: ${result.length}`);
    return result;

  } catch (err) {
    console.error('[Sindo] Scraping gagal:', err.message);
    return [];
  }
}