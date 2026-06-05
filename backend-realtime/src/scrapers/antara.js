/**
 * antara.js - Realtime scraper untuk Antaranews.com (LKBN ANTARA)
 *
 * Karakteristik khusus Antara (berbeda dari Kompas, Tempo, Tribun):
 *
 * 1. POLA URL ARTIKEL — SEMUA artikel ada di path /berita/:
 *    https://www.antaranews.com/berita/<id>/<slug>
 *    Contoh: antaranews.com/berita/5576237/kemenpora-tegaskan-peran-penting-koni
 *    Tidak ada path /nasional/<slug> atau /<kategori>/<slug>.
 *    Kategori hanya sebagai filter listing, bukan bagian URL artikel.
 *
 * 2. HALAMAN KATEGORI — diverifikasi Mei 2026:
 *    /politik, /hukum, /ekonomi, /metro, /sepakbola, /olahraga,
 *    /humaniora, /lifestyle, /hiburan, /nusantara, /dunia,
 *    /tekno, /otomotif, /warta-bumi
 *
 * 3. TAG PAGE:
 *    antaranews.com/tag/<slug> — aktif ✅
 *
 * 4. SEARCH:
 *    antaranews.com/search?q=<query> — perlu dicek, bisa HTML atau JS
 *
 * 5. SUBDOMAIN REGIONAL:
 *    megapolitan.antaranews.com, jabar.antaranews.com, dll
 *    Artikel di subdomain juga menggunakan pola /berita/<id>/<slug>
 *
 * 6. Antara adalah kantor berita negara (LKBN) — konten lebih formal,
 *    wire-style, tanpa iklan berlebihan. Struktur HTML lebih bersih.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// ── Konstanta ──────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.antaranews.com';
const DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '600');
const MAX_RETRY = 2;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

// ── Kategori aktif — diverifikasi dari menu Antara Mei 2026 ───────────────

const CATEGORY_URLS = {
  // Politik & Hukum
  politik:        `${BASE_URL}/politik`,
  nasional:       `${BASE_URL}/politik`,
  pemerintahan:   `${BASE_URL}/politik`,
  hukum:          `${BASE_URL}/hukum`,
  kriminal:       `${BASE_URL}/hukum`,

  // Ekonomi & Bisnis
  ekonomi:        `${BASE_URL}/ekonomi`,
  bisnis:         `${BASE_URL}/ekonomi`,
  keuangan:       `${BASE_URL}/ekonomi`,

  // Olahraga
  olahraga:       `${BASE_URL}/olahraga`,
  sport:          `${BASE_URL}/olahraga`,
  sepakbola:      `${BASE_URL}/sepakbola`,
  bola:           `${BASE_URL}/sepakbola`,
  timnas:         `${BASE_URL}/sepakbola`,

  // Teknologi
  teknologi:      `${BASE_URL}/tekno`,
  tekno:          `${BASE_URL}/tekno`,
  digital:        `${BASE_URL}/tekno`,

  // Gaya Hidup & Hiburan
  'gaya hidup':   `${BASE_URL}/lifestyle`,
  lifestyle:      `${BASE_URL}/lifestyle`,
  gaya:           `${BASE_URL}/lifestyle`,
  hiburan:        `${BASE_URL}/hiburan`,
  seleb:          `${BASE_URL}/hiburan`,
  film:           `${BASE_URL}/hiburan`,
  musik:          `${BASE_URL}/hiburan`,

  // Sosial & Budaya
  humaniora:      `${BASE_URL}/humaniora`,
  budaya:         `${BASE_URL}/humaniora`,
  pendidikan:     `${BASE_URL}/humaniora`,
  sosial:         `${BASE_URL}/humaniora`,

  // Lainnya
  otomotif:       `${BASE_URL}/otomotif`,
  metro:          `${BASE_URL}/metro`,
  jakarta:        `${BASE_URL}/metro`,
  nusantara:      `${BASE_URL}/nusantara`,
  regional:       `${BASE_URL}/nusantara`,
  internasional:  `${BASE_URL}/dunia`,
  dunia:          `${BASE_URL}/dunia`,
  'warta bumi':   `${BASE_URL}/warta-bumi`,
  lingkungan:     `${BASE_URL}/warta-bumi`,
  iklim:          `${BASE_URL}/warta-bumi`,
};

// Slug kategori → label standar
const PATH_CATEGORY = {
  politik:      'nasional',
  hukum:        'hukum',
  ekonomi:      'ekonomi',
  olahraga:     'olahraga',
  sepakbola:    'olahraga',
  tekno:        'teknologi',
  lifestyle:    'gaya hidup',
  hiburan:      'hiburan',
  humaniora:    'humaniora',
  otomotif:     'otomotif',
  metro:        'metro',
  nusantara:    'regional',
  dunia:        'internasional',
  'warta-bumi': 'lingkungan',
};

// Keyword → kategori relevan
const KEYWORD_CATEGORY_MAP = {
  dolar:        ['ekonomi'],
  rupiah:       ['ekonomi'],
  saham:        ['ekonomi'],
  ihsg:         ['ekonomi'],
  inflasi:      ['ekonomi'],
  pajak:        ['ekonomi', 'politik'],
  anggaran:     ['ekonomi', 'politik'],
  apbn:         ['ekonomi', 'politik'],
  pemilu:       ['politik'],
  presiden:     ['politik'],
  prabowo:      ['politik'],
  dpr:          ['politik'],
  korupsi:      ['hukum'],
  kpk:          ['hukum'],
  mahkamah:     ['hukum'],
  covid:        ['humaniora', 'nasional'],
  vaksin:       ['humaniora'],
  timnas:       ['sepakbola'],
  liga:         ['sepakbola'],
  piala:        ['sepakbola', 'olahraga'],
  bulu:         ['olahraga'],
  badminton:    ['olahraga'],
  ai:           ['tekno'],
  iphone:       ['tekno'],
  smartphone:   ['tekno'],
  startup:      ['tekno', 'ekonomi'],
  fashion:      ['lifestyle'],
  wisata:       ['lifestyle'],
  travel:       ['lifestyle'],
  banjir:       ['warta-bumi', 'nusantara'],
  gempa:        ['warta-bumi', 'nusantara'],
  cuaca:        ['warta-bumi'],
};

// ── Utilitas ───────────────────────────────────────────────────────────────

const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const sleep    = ms  => new Promise(r => setTimeout(r, ms));

/**
 * Deteksi kategori dari URL artikel Antara.
 * Antara menggunakan /berita/<id>/<slug> untuk semua artikel,
 * sehingga kategori hanya bisa diketahui dari konteks listing
 * atau dari breadcrumb di halaman artikel.
 */
function categoryFromMeta($, url) {
  // Coba ambil dari breadcrumb / meta kategori
  const breadcrumb =
    $('nav.breadcrumb a').eq(1).text().trim() ||
    $('div.breadcrumbs a').eq(1).text().trim() ||
    $('meta[property="article:section"]').attr('content')?.trim();

  if (breadcrumb) {
    const slug = breadcrumb.toLowerCase().replace(/\s+/g, '-');
    return PATH_CATEGORY[slug] || breadcrumb.toLowerCase();
  }

  // Fallback: subdomain
  try {
    const host = new URL(url).hostname;
    const sub  = host.split('.')[0];
    if (sub !== 'www') return `regional (${sub})`;
  } catch { /* empty */ }

  return 'umum';
}

/**
 * Validasi URL artikel Antara.
 * Pola: antaranews.com/berita/<id-numerik>/<slug>
 * Juga mendukung subdomain: megapolitan.antaranews.com/berita/...
 */
function isAntaraArticleUrl(href) {
  if (!href || !href.startsWith('http')) return false;
  if (!href.includes('antaranews.com')) return false;

  const excludes = [
    '/tag/', '/search', '/foto/', '/video/', '/infografik/',
    '/redaksi', '/about', '/kontak', '/iklan', '#', 'javascript:',
  ];
  if (excludes.some(ex => href.includes(ex))) return false;

  try {
    const { pathname } = new URL(href);
    // Harus mengandung /berita/ dan ID numerik
    return pathname.includes('/berita/') && /\/\d{4,}\//.test(pathname);
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
          'Referer':         'https://www.antaranews.com/',
        },
        timeout: 25000,
        maxRedirects: 5,
      });
      return cheerio.load(res.data);
    } catch (err) {
      const status = err.response?.status;
      console.warn(`[Antara] Attempt ${attempt}/${retries} gagal untuk ${url}: ${err.message}`);
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
    // Antara: h1.title atau h1[itemprop="headline"]
    const title =
      $('h1.title').first().text().trim() ||
      $('h1[itemprop="headline"]').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('h1').first().text().trim();

    // ── Konten ──
    // Antara: div.post-content atau div[itemprop="articleBody"]
    const contentSelectors = [
      'div.post-content',
      'div[itemprop="articleBody"]',
      'div.article-body',
      'div.detail-content',
      'section.article-content',
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
        'noscript', '.socials', '.share-buttons',
      ].join(',')).remove();
      content = contentEl.text().replace(/\s+/g, ' ').trim();
    }

    // Fallback: paragraf artikel
    if (!content || content.length < 80) {
      const parts = [];
      $('div.post-content p, article p, div.detail p').each((_, el) => {
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

    // Fallback: teks tanggal Antara — format "25 Februari 2026 07:39 WIB"
    if (!published_date) {
      const dateText =
        $('span.article-date').text().trim() ||
        $('div.post-date').text().trim() ||
        $('time').first().text().trim() ||
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
    // Antara biasanya mencantumkan "Pewarta: Nama / Editor: Nama"
    const author =
      $('[itemprop="author"]').first().text().trim() ||
      $('meta[name="author"]').attr('content')?.trim() ||
      $('span.author').first().text().replace('Pewarta:', '').trim() ||
      $('p.reporter').first().text().replace('Pewarta:', '').trim() ||
      null;

    // ── Gambar & deskripsi ──
    const image_url   = $('meta[property="og:image"]').attr('content') || null;
    const description = $('meta[property="og:description"]').attr('content')?.trim() || null;

    // ── Validasi ──
    if (!title || title.length < 10) {
      console.warn(`[Antara] Skip (judul kosong): ${url}`);
      return null;
    }
    if (!content || content.length < 80) {
      if (description?.length > 50) {
        return {
          title, content: description, url, source: 'antara',
          published_date, author, image_url,
          category: categoryFromMeta($, url),
        };
      }
      console.warn(`[Antara] Skip (konten kosong): ${url}`);
      return null;
    }

    return {
      title,
      content,
      url,
      source: 'antara',
      published_date,
      author: author || null,
      image_url,
      category: categoryFromMeta($, url),
    };
  } catch (err) {
    console.error(`[Antara] Error parse ${url}:`, err.message);
    return null;
  }
}

// ── Kumpulkan URL dari halaman listing ────────────────────────────────────

async function scrapeListingPage(pageUrl) {
  const $ = await fetchPage(pageUrl);
  const links = new Set();

  // Antara menggunakan struktur yang cukup bersih
  const selectors = [
    'article h2 a',
    'article h3 a',
    'div.col-news h1 a',
    'div.col-news h2 a',
    'div.col-news h3 a',
    '.card-news h3 a',
    '.list-news h3 a',
    'h2.article-title a',
    'h3.article-title a',
    'a[href*="/berita/"]',       // fallback lebar
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr('href');
      if (isAntaraArticleUrl(href)) links.add(href.split('?')[0]);
    });
  }

  return [...links];
}

// ── Scrape search Antara ───────────────────────────────────────────────────

async function scrapeAntaraSearch(query) {
  const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(query)}`;
  console.log(`[Antara] Scraping search: ${searchUrl}`);
  try {
    const urls = await scrapeListingPage(searchUrl);
    if (urls.length === 0) {
      console.warn('[Antara] Search tidak menghasilkan URL.');
    }
    return urls;
  } catch (err) {
    console.warn('[Antara] Search gagal:', err.message);
    return [];
  }
}

// ── Scrape tag page ───────────────────────────────────────────────────────

async function scrapeTagPage(query) {
  const slug    = query.toLowerCase().replace(/\s+/g, '-');
  const tagUrl  = `${BASE_URL}/tag/${encodeURIComponent(slug)}`;
  console.log(`[Antara] Scraping tag: ${tagUrl}`);
  try {
    return await scrapeListingPage(tagUrl);
  } catch (err) {
    console.warn(`[Antara] Tag page gagal (${slug}):`, err.message);
    return [];
  }
}

// ── Tentukan kategori relevan dari keyword ────────────────────────────────

function guessCategories(query) {
  const q = query.toLowerCase();
  for (const [kw, cats] of Object.entries(KEYWORD_CATEGORY_MAP)) {
    if (q.includes(kw)) return cats;
  }
  return ['politik', 'ekonomi'];
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
 * Scrape artikel dari Antaranews.com
 *
 * @param {string}  query        - Kata kunci atau nama kategori
 * @param {number}  maxArticles  - Default 5
 * @param {string}  dateFrom     - ISO date (opsional)
 * @param {string}  dateTo       - ISO date (opsional)
 */
export async function scrapeAntara(query, maxArticles = 5, dateFrom, dateTo) {
  try {
    const qLower = query ? query.toLowerCase().trim() : '';
    let urls = [];

    if (!query) {
      // Tidak ada query → homepage / breaking news
      console.log('[Antara] Scraping homepage...');
      urls = await scrapeListingPage(BASE_URL);

    } else if (CATEGORY_URLS[qLower] && !dateFrom && !dateTo) {
      // Query cocok dengan nama kategori
      console.log(`[Antara] Scraping kategori: ${CATEGORY_URLS[qLower]}`);
      urls = await scrapeListingPage(CATEGORY_URLS[qLower]);

    } else {
      // Query bebas — coba berurutan

      // Strategi 1: Search HTML
      urls = await scrapeAntaraSearch(query);

      // Strategi 2: Tag page
      if (urls.length === 0) {
        urls = await scrapeTagPage(query);
      }

      // Strategi 3: Scrape kategori relevan
      if (urls.length === 0) {
        const cats = guessCategories(qLower);
        console.log(`[Antara] Fallback kategori relevan: ${cats.join(', ')}`);
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
    console.log(`[Antara] URLs ditemukan: ${urls.length}, mulai parse...`);

    const articles = [];
    for (const url of urls) {
      if (articles.length >= maxArticles) break;
      const art = await parseArticle(url);
      if (art) {
        articles.push(art);
        console.log(`[Antara] ✅ ${art.title.substring(0, 70)}`);
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
    console.log(`[Antara] Total artikel dikembalikan: ${result.length}`);
    return result;

  } catch (err) {
    console.error('[Antara] Scraping gagal:', err.message);
    return [];
  }
}