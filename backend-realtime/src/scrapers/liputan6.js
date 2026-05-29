/**
 * liputan6.js - Realtime scraper untuk Liputan6.com
 *
 * Karakteristik khusus Liputan6 (berbeda dari Kompas, Tempo, Tribun, Antara):
 *
 * 1. POLA URL ARTIKEL — semua artikel menggunakan pola:
 *    https://www.liputan6.com/<kategori>/read/<id>/<slug>
 *    Contoh:
 *      liputan6.com/bisnis/read/6819311/sensus-ekonomi-2026
 *      liputan6.com/tekno/read/6407323/laporan-dari-bangkok
 *      liputan6.com/cek-fakta/read/7339377/cek-fakta-bantuan-ibu-hamil
 *    Kategori SELALU ada di URL → bisa langsung dipetakan.
 *
 * 2. HALAMAN KATEGORI — diverifikasi Mei 2026:
 *    /news, /bisnis, /bola, /showbiz, /tekno, /health, /lifestyle,
 *    /otomotif, /regional, /global, /islami, /saham, /crypto,
 *    /cek-fakta, /citizen6, /opini
 *
 * 3. HALAMAN INDEKS per kategori — listing HTML statis, sangat reliabel:
 *    liputan6.com/<kategori>/indeks
 *    Contoh: liputan6.com/tekno/indeks
 *    Ini lebih baik daripada scrape halaman kategori utama yang
 *    sering punya lazy-load.
 *
 * 4. TAG PAGE:
 *    liputan6.com/tag/<slug> — aktif ✅
 *
 * 5. SEARCH:
 *    liputan6.com/search?q=<query> — tersedia tapi perlu dicek HTML/JS
 *
 * 6. Liputan6 adalah portal Emtek Group (SCTV) — konten beragam,
 *    termasuk kanal khusus: Surabaya, Islami, Cek Fakta, Crypto, dll.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// ── Konstanta ──────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.liputan6.com';
const DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '600');
const MAX_RETRY = 2;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

// ── Kategori aktif — diverifikasi Mei 2026 ────────────────────────────────

const CATEGORY_URLS = {
  // Berita & Politik
  news:           `${BASE_URL}/news`,
  nasional:       `${BASE_URL}/news`,
  politik:        `${BASE_URL}/news`,
  hukum:          `${BASE_URL}/news`,
  peristiwa:      `${BASE_URL}/news`,

  // Bisnis & Ekonomi
  bisnis:         `${BASE_URL}/bisnis`,
  ekonomi:        `${BASE_URL}/bisnis`,
  keuangan:       `${BASE_URL}/bisnis`,
  saham:          `${BASE_URL}/saham`,
  crypto:         `${BASE_URL}/crypto`,
  kripto:         `${BASE_URL}/crypto`,

  // Olahraga
  bola:           `${BASE_URL}/bola`,
  olahraga:       `${BASE_URL}/bola`,
  sepakbola:      `${BASE_URL}/bola`,
  sport:          `${BASE_URL}/bola`,

  // Teknologi
  tekno:          `${BASE_URL}/tekno`,
  teknologi:      `${BASE_URL}/tekno`,
  digital:        `${BASE_URL}/tekno`,
  gadget:         `${BASE_URL}/tekno`,

  // Hiburan & Gaya Hidup
  showbiz:        `${BASE_URL}/showbiz`,
  hiburan:        `${BASE_URL}/showbiz`,
  seleb:          `${BASE_URL}/showbiz`,
  film:           `${BASE_URL}/showbiz`,
  musik:          `${BASE_URL}/showbiz`,
  lifestyle:      `${BASE_URL}/lifestyle`,
  'gaya hidup':   `${BASE_URL}/lifestyle`,
  gaya:           `${BASE_URL}/lifestyle`,

  // Kesehatan
  health:         `${BASE_URL}/health`,
  kesehatan:      `${BASE_URL}/health`,

  // Lainnya
  otomotif:       `${BASE_URL}/otomotif`,
  regional:       `${BASE_URL}/regional`,
  daerah:         `${BASE_URL}/regional`,
  global:         `${BASE_URL}/global`,
  internasional:  `${BASE_URL}/global`,
  dunia:          `${BASE_URL}/global`,
  islami:         `${BASE_URL}/islami`,
  'cek fakta':    `${BASE_URL}/cek-fakta`,
  hoax:           `${BASE_URL}/cek-fakta`,
  opini:          `${BASE_URL}/opini`,
  citizen6:       `${BASE_URL}/citizen6`,
};

// Segment kategori di URL → label standar
const PATH_CATEGORY = {
  news:         'nasional',
  bisnis:       'ekonomi',
  bola:         'olahraga',
  tekno:        'teknologi',
  showbiz:      'hiburan',
  lifestyle:    'gaya hidup',
  health:       'kesehatan',
  otomotif:     'otomotif',
  regional:     'regional',
  global:       'internasional',
  islami:       'islami',
  saham:        'saham',
  crypto:       'kripto',
  'cek-fakta':  'cek fakta',
  opini:        'opini',
  citizen6:     'citizen6',
};

// Keyword → kategori relevan (fallback)
const KEYWORD_CATEGORY_MAP = {
  dolar:        ['bisnis'],
  rupiah:       ['bisnis'],
  saham:        ['saham', 'bisnis'],
  ihsg:         ['saham', 'bisnis'],
  inflasi:      ['bisnis'],
  pajak:        ['bisnis', 'news'],
  anggaran:     ['bisnis', 'news'],
  bitcoin:      ['crypto'],
  kripto:       ['crypto'],
  ethereum:     ['crypto'],
  pemilu:       ['news'],
  presiden:     ['news'],
  prabowo:      ['news'],
  korupsi:      ['news'],
  kpk:          ['news'],
  covid:        ['health', 'news'],
  vaksin:       ['health'],
  timnas:       ['bola'],
  liga:         ['bola'],
  persija:      ['bola'],
  piala:        ['bola'],
  iphone:       ['tekno'],
  android:      ['tekno'],
  laptop:       ['tekno'],
  ai:           ['tekno'],
  startup:      ['tekno', 'bisnis'],
  artis:        ['showbiz'],
  drakor:       ['showbiz'],
  k3n:          ['showbiz'],
  film:         ['showbiz'],
  fashion:      ['lifestyle'],
  kuliner:      ['lifestyle'],
  wisata:       ['lifestyle'],
  diet:         ['health'],
  kanker:       ['health'],
  gempa:        ['news', 'regional'],
  banjir:       ['news', 'regional'],
};

// ── Utilitas ───────────────────────────────────────────────────────────────

const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const sleep    = ms  => new Promise(r => setTimeout(r, ms));

/**
 * Ambil kategori dari URL artikel Liputan6.
 * Pola: liputan6.com/<kategori>/read/<id>/<slug>
 * Kategori selalu ada di path[0].
 */
function categoryFromUrl(url) {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    // segments[0] = kategori, segments[1] = 'read', segments[2] = id
    return PATH_CATEGORY[segments[0]] || segments[0] || 'umum';
  } catch {
    return 'umum';
  }
}

/**
 * Validasi URL artikel Liputan6.
 * Pola wajib: /read/ + ID numerik di dalamnya.
 */
function isLiputan6ArticleUrl(href) {
  if (!href || !href.startsWith('http')) return false;
  if (!href.includes('liputan6.com')) return false;

  const excludes = [
    '/tag/', '/search', '/indeks', '/video/', '/foto/', '/photo/',
    '/author/', '/redaksi', '/about', '/contact', '#', 'javascript:',
    '/pilkada', '/feeds',
  ];
  if (excludes.some(ex => href.includes(ex))) return false;

  try {
    const { pathname } = new URL(href);
    // Harus mengandung /read/ dan angka ID
    return pathname.includes('/read/') && /\/read\/\d{4,}\//.test(pathname);
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
          'Referer':         'https://www.liputan6.com/',
        },
        timeout: 25000,
        maxRedirects: 5,
      });
      return cheerio.load(res.data);
    } catch (err) {
      const status = err.response?.status;
      console.warn(`[Liputan6] Attempt ${attempt}/${retries} gagal untuk ${url}: ${err.message}`);
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
      $('h1.read-page--header--title').first().text().trim() ||
      $('h1[itemprop="headline"]').first().text().trim() ||
      $('h1.article-title').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('h1').first().text().trim();

    // ── Konten ──
    // Liputan6 menggunakan div.article-content-body atau
    // div[itemprop="articleBody"] untuk body artikel
    const contentSelectors = [
      'div.article-content-body',
      'div[itemprop="articleBody"]',
      'div.read-page--content',
      'div.content-text',
      'article.article',
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
        '.ads', '.advertisement', '.baca-juga', '.read-more',
        '.related-article', 'noscript', '.social-share',
        '.article-tags', '.ads-container',
      ].join(',')).remove();
      content = contentEl.text().replace(/\s+/g, ' ').trim();
    }

    // Fallback: kumpulkan semua <p> yang panjang
    if (!content || content.length < 80) {
      const parts = [];
      $('div.article-content-body p, div[itemprop="articleBody"] p, article p').each((_, el) => {
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

    // Fallback: teks tanggal — Liputan6 format "Diterbitkan 28 Mei 2026, 12:00 WIB"
    if (!published_date) {
      const dateText =
        $('time.read-page--header--author__datetime').text().trim() ||
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
      $('a.read-page--header--author__name').first().text().trim() ||
      $('span.author-name').first().text().trim() ||
      null;

    // ── Gambar & deskripsi ──
    const image_url   = $('meta[property="og:image"]').attr('content') || null;
    const description = $('meta[property="og:description"]').attr('content')?.trim() || null;

    // ── Validasi ──
    if (!title || title.length < 10) {
      console.warn(`[Liputan6] Skip (judul kosong): ${url}`);
      return null;
    }
    if (!content || content.length < 80) {
      if (description?.length > 50) {
        return {
          title, content: description, url, source: 'liputan6',
          published_date, author, image_url,
          category: categoryFromUrl(url),
        };
      }
      console.warn(`[Liputan6] Skip (konten kosong): ${url}`);
      return null;
    }

    return {
      title,
      content,
      url,
      source: 'liputan6',
      published_date,
      author: author || null,
      image_url,
      category: categoryFromUrl(url),
    };
  } catch (err) {
    console.error(`[Liputan6] Error parse ${url}:`, err.message);
    return null;
  }
}

// ── Kumpulkan URL dari halaman listing biasa ──────────────────────────────

async function scrapeListingPage(pageUrl) {
  const $ = await fetchPage(pageUrl);
  const links = new Set();

  const selectors = [
    'h4.articles--iridescent-list--text-item__title a',
    'h2.article-item-title a',
    'h3.article-item-title a',
    '.articles--rows--item__title a',
    'article h2 a',
    'article h3 a',
    'a[href*="/read/"]',   // fallback lebar
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr('href');
      if (isLiputan6ArticleUrl(href)) links.add(href.split('?')[0]);
    });
  }

  return [...links];
}

// ── Scrape halaman indeks kategori (HTML statis, paling reliabel) ──────────
// Liputan6 punya /<kategori>/indeks yang berisi listing artikel bersih

async function scrapeIndeksPage(categorySlug) {
  const indeksUrl = `${BASE_URL}/${categorySlug}/indeks`;
  console.log(`[Liputan6] Scraping indeks: ${indeksUrl}`);
  try {
    return await scrapeListingPage(indeksUrl);
  } catch (err) {
    // Fallback ke halaman kategori biasa
    console.warn(`[Liputan6] Indeks gagal, coba halaman kategori: ${err.message}`);
    return scrapeListingPage(`${BASE_URL}/${categorySlug}`).catch(() => []);
  }
}

// ── Scrape search ─────────────────────────────────────────────────────────

async function scrapeLiputan6Search(query) {
  const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(query)}`;
  console.log(`[Liputan6] Scraping search: ${searchUrl}`);
  try {
    const urls = await scrapeListingPage(searchUrl);
    if (urls.length === 0) {
      console.warn('[Liputan6] Search tidak menghasilkan URL.');
    }
    return urls;
  } catch (err) {
    console.warn('[Liputan6] Search gagal:', err.message);
    return [];
  }
}

// ── Scrape tag page ───────────────────────────────────────────────────────

async function scrapeTagPage(query) {
  const slug   = query.toLowerCase().replace(/\s+/g, '-');
  const tagUrl = `${BASE_URL}/tag/${encodeURIComponent(slug)}`;
  console.log(`[Liputan6] Scraping tag: ${tagUrl}`);
  try {
    return await scrapeListingPage(tagUrl);
  } catch (err) {
    console.warn(`[Liputan6] Tag page gagal (${slug}):`, err.message);
    return [];
  }
}

// ── Tentukan kategori relevan dari keyword ────────────────────────────────

function guessCategories(query) {
  const q = query.toLowerCase();
  for (const [kw, cats] of Object.entries(KEYWORD_CATEGORY_MAP)) {
    if (q.includes(kw)) return cats;
  }
  return ['news', 'bisnis'];
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
 * Scrape artikel dari Liputan6.com
 *
 * @param {string}  query        - Kata kunci atau nama kategori
 * @param {number}  maxArticles  - Default 5
 * @param {string}  dateFrom     - ISO date (opsional)
 * @param {string}  dateTo       - ISO date (opsional)
 */
export async function scrapeLiputan6(query, maxArticles = 5, dateFrom, dateTo) {
  try {
    const qLower = query ? query.toLowerCase().trim() : '';
    let urls = [];

    if (!query) {
      // Tidak ada query → indeks news
      console.log('[Liputan6] Scraping indeks news...');
      urls = await scrapeIndeksPage('news');

    } else if (CATEGORY_URLS[qLower] && !dateFrom && !dateTo) {
      // Query cocok dengan nama kategori — pakai halaman indeks
      const catUrl  = CATEGORY_URLS[qLower];
      const catSlug = catUrl.replace(`${BASE_URL}/`, '');
      console.log(`[Liputan6] Scraping indeks kategori: ${catSlug}`);
      urls = await scrapeIndeksPage(catSlug);

    } else {
      // Query bebas — coba berurutan

      // Strategi 1: Search
      urls = await scrapeLiputan6Search(query);

      // Strategi 2: Tag page
      if (urls.length === 0) {
        urls = await scrapeTagPage(query);
      }

      // Strategi 3: Indeks kategori relevan
      if (urls.length === 0) {
        const cats = guessCategories(qLower);
        console.log(`[Liputan6] Fallback indeks kategori: ${cats.join(', ')}`);
        const results = await Promise.all(
          cats.map(c => scrapeIndeksPage(c).catch(() => []))
        );
        urls = [...new Set(results.flat())];
      }
    }

    // Dedup & batasi
    urls = [...new Set(urls)].slice(0, maxArticles * 3);
    console.log(`[Liputan6] URLs ditemukan: ${urls.length}, mulai parse...`);

    const articles = [];
    for (const url of urls) {
      if (articles.length >= maxArticles) break;
      const art = await parseArticle(url);
      if (art) {
        articles.push(art);
        console.log(`[Liputan6] ✅ ${art.title.substring(0, 70)}`);
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
    console.log(`[Liputan6] Total artikel dikembalikan: ${result.length}`);
    return result;

  } catch (err) {
    console.error('[Liputan6] Scraping gagal:', err.message);
    return [];
  }
}