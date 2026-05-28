/**
 * tribun.js - Realtime scraper untuk Tribunnews.com
 *
 * Karakteristik khusus Tribun (berbeda dari Kompas & Tempo):
 *
 * 1. STRUKTUR URL ARTIKEL:
 *    Tribun punya DUA pola URL artikel:
 *    a) tribunnews.com/<kategori>/<id>/<slug>
 *       Contoh: tribunnews.com/nasional/2026/05/28/prabowo-teken-perpres
 *    b) <kota>.tribunnews.com/<kategori>/<id>/<slug>
 *       Contoh: banyumas.tribunnews.com/nasional/90035/daftar-tanggal-merah
 *    Kedua pola harus dideteksi.
 *
 * 2. KATEGORI AKTIF (diverifikasi Mei 2026):
 *    /nasional, /bisnis, /sport, /superskor, /lifestyle, /techno,
 *    /seleb, /otomotif, /kesehatan, /travel, /internasional,
 *    /regional, /metropolitan
 *    CATATAN: tidak ada /ekonomi — di Tribun namanya /bisnis
 *             tidak ada /olahraga — namanya /sport
 *             tidak ada /teknologi — namanya /techno
 *
 * 3. TAG PAGE:
 *    tribunnews.com/tag/<slug> — aktif dan berisi listing artikel ✅
 *
 * 4. SEARCH PAGE:
 *    tribunnews.com/search?q=<query> — aktif, ada hasil HTML ✅
 *    (tidak seperti Kompas/Tempo yang CSE JS-only)
 *
 * 5. JARINGAN REGIONAL (Tribun Network):
 *    Artikel dari subdomain regional tetap valid sebagai sumber berita.
 *    Bisa diaktifkan sebagai sumber tambahan via REGIONAL_SOURCES.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// ── Konstanta ──────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.tribunnews.com';
const DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '600');
const MAX_RETRY = 2;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

// ── Kategori aktif — diverifikasi dari menu Tribunnews Mei 2026 ───────────

const CATEGORY_URLS = {
  // Berita Utama
  nasional:       `${BASE_URL}/nasional`,
  politik:        `${BASE_URL}/nasional/politik`,
  hukum:          `${BASE_URL}/nasional`,
  pemerintahan:   `${BASE_URL}/nasional`,

  // Bisnis & Ekonomi — di Tribun namanya "bisnis", bukan "ekonomi"
  bisnis:         `${BASE_URL}/bisnis`,
  ekonomi:        `${BASE_URL}/bisnis`,
  keuangan:       `${BASE_URL}/bisnis`,

  // Olahraga — di Tribun namanya "sport" dan "superskor"
  olahraga:       `${BASE_URL}/sport`,
  sport:          `${BASE_URL}/sport`,
  sepakbola:      `${BASE_URL}/superskor`,
  superskor:      `${BASE_URL}/superskor`,
  bola:           `${BASE_URL}/superskor`,

  // Teknologi — di Tribun namanya "techno"
  teknologi:      `${BASE_URL}/techno`,
  techno:         `${BASE_URL}/techno`,
  digital:        `${BASE_URL}/techno`,

  // Gaya Hidup
  'gaya hidup':   `${BASE_URL}/lifestyle`,
  lifestyle:      `${BASE_URL}/lifestyle`,
  gaya:           `${BASE_URL}/lifestyle`,

  // Hiburan & Selebriti
  hiburan:        `${BASE_URL}/seleb`,
  seleb:          `${BASE_URL}/seleb`,
  selebriti:      `${BASE_URL}/seleb`,
  musik:          `${BASE_URL}/seleb`,
  film:           `${BASE_URL}/seleb`,

  // Lainnya
  otomotif:       `${BASE_URL}/otomotif`,
  kesehatan:      `${BASE_URL}/kesehatan`,
  travel:         `${BASE_URL}/travel`,
  internasional:  `${BASE_URL}/internasional`,
  dunia:          `${BASE_URL}/internasional`,
  regional:       `${BASE_URL}/regional`,
  metro:          `${BASE_URL}/metropolitan`,
  metropolitan:   `${BASE_URL}/metropolitan`,
  pendidikan:     `${BASE_URL}/pendidikan`,
  sains:          `${BASE_URL}/sains`,
};

// Path segment → label kategori
const PATH_CATEGORY = {
  nasional:       'nasional',
  politik:        'nasional',
  bisnis:         'ekonomi',
  sport:          'olahraga',
  superskor:      'olahraga',
  techno:         'teknologi',
  lifestyle:      'gaya hidup',
  seleb:          'hiburan',
  otomotif:       'otomotif',
  kesehatan:      'kesehatan',
  travel:         'travel',
  internasional:  'internasional',
  regional:       'regional',
  metropolitan:   'metro',
  pendidikan:     'pendidikan',
  sains:          'sains',
};

// Keyword → kategori relevan (untuk fallback)
const KEYWORD_CATEGORY_MAP = {
  dolar:        ['bisnis', 'nasional'],
  rupiah:       ['bisnis'],
  saham:        ['bisnis'],
  ihsg:         ['bisnis'],
  inflasi:      ['bisnis'],
  pajak:        ['bisnis', 'nasional'],
  anggaran:     ['bisnis', 'nasional'],
  pemilu:       ['nasional'],
  presiden:     ['nasional'],
  prabowo:      ['nasional'],
  korupsi:      ['nasional'],
  kpk:          ['nasional'],
  covid:        ['kesehatan', 'nasional'],
  vaksin:       ['kesehatan'],
  timnas:       ['sport', 'superskor'],
  liga:         ['sport', 'superskor'],
  persija:      ['superskor'],
  arema:        ['superskor'],
  ai:           ['techno'],
  iphone:       ['techno'],
  samsung:      ['techno'],
  startup:      ['techno', 'bisnis'],
  fashion:      ['lifestyle'],
  kuliner:      ['lifestyle', 'travel'],
  wisata:       ['travel'],
  artis:        ['seleb'],
  drakor:       ['seleb'],
};

// ── Utilitas ───────────────────────────────────────────────────────────────

const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const sleep    = ms => new Promise(r => setTimeout(r, ms));

function categoryFromUrl(url) {
  try {
    const { hostname, pathname } = new URL(url);
    const segments = pathname.split('/').filter(Boolean);

    // Cek path segment pertama
    if (segments[0] && PATH_CATEGORY[segments[0]]) {
      return PATH_CATEGORY[segments[0]];
    }

    // Subdomain regional: banyumas.tribunnews.com → regional
    const subdomain = hostname.split('.')[0];
    if (subdomain !== 'www' && subdomain !== 'tribunnews') {
      return `regional (${subdomain})`;
    }

    return segments[0] || 'umum';
  } catch {
    return 'umum';
  }
}

/**
 * Validasi URL artikel Tribun.
 * Pola valid:
 *   - www.tribunnews.com/<kategori>/<tahun>/<bulan>/<hari>/<slug>
 *   - www.tribunnews.com/<kategori>/<id-numerik>/<slug>
 *   - <kota>.tribunnews.com/<kategori>/<id>/<slug>
 */
function isTribunArticleUrl(href) {
  if (!href || !href.startsWith('http')) return false;
  if (!href.includes('tribunnews.com')) return false;

  const excludes = [
    '/tag/', '/topic/', '/search', '/author/', '/login', '/redaksi',
    '/about', '/contact', '/terms', '/privacy', '/video/', '/images/',
    '/indeks', '/epaper', '#', 'javascript:',
  ];
  if (excludes.some(ex => href.includes(ex))) return false;

  try {
    const { pathname } = new URL(href);
    const segments = pathname.split('/').filter(Boolean);
    // Minimal 2 segmen, dan harus ada angka (ID artikel atau tahun)
    return segments.length >= 2 && /\d{4,}/.test(pathname);
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
          'Referer':         'https://www.tribunnews.com/',
        },
        timeout: 25000,
        maxRedirects: 5,
      });
      return cheerio.load(res.data);
    } catch (err) {
      const status = err.response?.status;
      console.warn(`[Tribun] Attempt ${attempt}/${retries} gagal untuk ${url}: ${err.message}`);
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
      $('h1#arttitle').first().text().trim() ||
      $('h1.title').first().text().trim() ||
      $('h1[itemprop="headline"]').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('h1').first().text().trim();

    // ── Konten ──
    // Tribun punya struktur: div#artikel atau div.side-article-txt
    const contentSelectors = [
      'div#artikel',
      'div.side-article-txt',
      'div[itemprop="articleBody"]',
      'div.article-content',
      'div.content-artikel',
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
        '.ads', '.baca-juga', '.recomended', '.recommendation',
        '.tribun-ads', '.banner-ads', 'noscript', '.read-more',
      ].join(',')).remove();
      content = contentEl.text().replace(/\s+/g, ' ').trim();
    }

    // Fallback: kumpulkan paragraf artikel
    if (!content || content.length < 80) {
      const parts = [];
      $('div#artikel p, div.side-article-txt p, article p').each((_, el) => {
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

    // Fallback: teks "Tayang: Jumat, 28 Mei 2026 10:30 WIB"
    if (!published_date) {
      const dateText =
        $('span#create_date').text().trim() ||
        $('time.article-date').text().trim() ||
        $('div.time').text().trim() ||
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
      $('.author-name').first().text().trim() ||
      $('div.reporter a').first().text().trim() ||
      null;

    // ── Gambar & deskripsi ──
    const image_url   = $('meta[property="og:image"]').attr('content') || null;
    const description = $('meta[property="og:description"]').attr('content')?.trim() || null;

    // ── Validasi ──
    if (!title || title.length < 10) {
      console.warn(`[Tribun] Skip (judul pendek/kosong): ${url}`);
      return null;
    }
    if (!content || content.length < 80) {
      if (description?.length > 50) {
        return {
          title, content: description, url, source: 'tribun',
          published_date, author, image_url, category: categoryFromUrl(url),
        };
      }
      console.warn(`[Tribun] Skip (konten kosong): ${url}`);
      return null;
    }

    return {
      title,
      content,
      url,
      source: 'tribun',
      published_date,
      author,
      image_url,
      category: categoryFromUrl(url),
    };
  } catch (err) {
    console.error(`[Tribun] Error parse ${url}:`, err.message);
    return null;
  }
}

// ── Kumpulkan URL dari halaman listing ────────────────────────────────────

async function scrapeListingPage(pageUrl) {
  const $ = await fetchPage(pageUrl);
  const links = new Set();

  // Tribun menggunakan berbagai selector tergantung template
  const selectors = [
    'h3.f16 a',                       // listing utama
    'h2.f20 a',                       // headline besar
    'h4.f16 a',                       // listing sekunder
    '.txt-article h3 a',
    '.list-berita h3 a',
    'article h3 a',
    'article h2 a',
    '.card-list h3 a',
    'a[href*="tribunnews.com"]',       // fallback lebar
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr('href');
      if (isTribunArticleUrl(href)) links.add(href.split('?')[0]);
    });
  }

  return [...links];
}

// ── Scrape halaman search Tribun ──────────────────────────────────────────
// Tribun memiliki search page HTML (bukan JS-only seperti Kompas)

async function scrapeTribunSearch(query) {
  const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(query)}`;
  console.log(`[Tribun] Scraping search: ${searchUrl}`);
  try {
    const urls = await scrapeListingPage(searchUrl);
    if (urls.length === 0) {
      console.warn('[Tribun] Search tidak menghasilkan URL.');
    }
    return urls;
  } catch (err) {
    console.warn('[Tribun] Search gagal:', err.message);
    return [];
  }
}

// ── Scrape tag page ───────────────────────────────────────────────────────

async function scrapeTagPage(query) {
  const slug = query.toLowerCase().replace(/\s+/g, '-');
  const tagUrl = `${BASE_URL}/tag/${encodeURIComponent(slug)}`;
  console.log(`[Tribun] Scraping tag: ${tagUrl}`);
  try {
    return await scrapeListingPage(tagUrl);
  } catch (err) {
    console.warn(`[Tribun] Tag page gagal (${slug}):`, err.message);
    return [];
  }
}

// ── Tentukan kategori relevan dari keyword ────────────────────────────────

function guessCategories(query) {
  const q = query.toLowerCase();
  for (const [kw, cats] of Object.entries(KEYWORD_CATEGORY_MAP)) {
    if (q.includes(kw)) return cats;
  }
  return ['nasional', 'bisnis'];
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
 * Scrape artikel dari Tribunnews.com
 *
 * @param {string}  query        - Kata kunci atau nama kategori
 * @param {number}  maxArticles  - Default 5
 * @param {string}  dateFrom     - ISO date (opsional)
 * @param {string}  dateTo       - ISO date (opsional)
 */
export async function scrapeTribun(query, maxArticles = 5, dateFrom, dateTo) {
  try {
    const qLower = query ? query.toLowerCase().trim() : '';
    let urls = [];

    if (!query) {
      // Tidak ada query → halaman nasional
      console.log('[Tribun] Scraping halaman nasional...');
      urls = await scrapeListingPage(`${BASE_URL}/nasional`);

    } else if (CATEGORY_URLS[qLower] && !dateFrom && !dateTo) {
      // Query cocok dengan nama kategori
      console.log(`[Tribun] Scraping kategori: ${CATEGORY_URLS[qLower]}`);
      urls = await scrapeListingPage(CATEGORY_URLS[qLower]);

    } else {
      // Query bebas — coba berurutan

      // Strategi 1: Search HTML (Tribun punya search yang bekerja)
      urls = await scrapeTribunSearch(query);

      // Strategi 2: Tag page
      if (urls.length === 0) {
        urls = await scrapeTagPage(query);
      }

      // Strategi 3: Scrape kategori relevan
      if (urls.length === 0) {
        const cats = guessCategories(qLower);
        console.log(`[Tribun] Fallback kategori relevan: ${cats.join(', ')}`);
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
    console.log(`[Tribun] URLs ditemukan: ${urls.length}, mulai parse...`);

    const articles = [];
    for (const url of urls) {
      if (articles.length >= maxArticles) break;
      const art = await parseArticle(url);
      if (art) {
        articles.push(art);
        console.log(`[Tribun] ✅ ${art.title.substring(0, 70)}`);
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
    console.log(`[Tribun] Total artikel dikembalikan: ${result.length}`);
    return result;

  } catch (err) {
    console.error('[Tribun] Scraping gagal:', err.message);
    return [];
  }
}