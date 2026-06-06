/**
 * merdeka.js - Realtime scraper untuk Merdeka.com (v2)
 *
 * PERBAIKAN v2 — berdasarkan inspeksi HTML asli Juni 2026:
 *
 * ROOT CAUSE hanya 3 artikel:
 * 1. Halaman listing /peristiwa menggunakan React SSR — konten artikel
 *    utama di-render via JS (lazy load), Cheerio hanya dapat sidebar.
 * 2. Selector yang dipakai (h2.article-title, h3.title, dll) tidak ada
 *    di HTML statis yang diterima Cheerio.
 * 3. Yang ADA di HTML statis hanya:
 *    - Section "Berita Terbaru" → list <a> di sidebar (5 artikel)
 *    - Section "Berita Terpopuler" → list <a> di sidebar
 *    - HEADLINE HARI INI → 3 link di hero section
 *
 * SOLUSI:
 * 1. Ekstrak SEMUA <a href="*-mvk.html"> dari seluruh halaman — ini
 *    menangkap semua artikel yang ada di HTML statis apapun posisinya.
 * 2. Multi-page: scrape halaman /peristiwa, /uang, dll SECARA PARALEL
 *    lalu gabungkan — jika satu halaman hanya dapat 5, ambil dari banyak.
 * 3. Gunakan halaman artikel individu sebagai sumber URL berikutnya:
 *    setiap artikel punya sidebar "Berita Terbaru" berisi 5 artikel baru.
 *    Teknik ini disebut "artikel-hop" — crawl dari artikel ke artikel.
 * 4. Gunakan API internal Merdeka (jika tersedia) atau indeks HTML.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// ── Konstanta ──────────────────────────────────────────────────────────────

const BASE_URL  = 'https://www.merdeka.com';
const DELAY_MS  = parseInt(process.env.SCRAPE_DELAY_MS || '500');
const MAX_RETRY = 2;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

// ── Kategori aktif — diverifikasi dari HTML asli Juni 2026 ────────────────
// Sumber: menu navigasi di halaman artikel merdeka.com

const CATEGORY_URLS = {
  peristiwa:    `${BASE_URL}/peristiwa`,
  news:         `${BASE_URL}/peristiwa`,
  nasional:     `${BASE_URL}/peristiwa`,
  berita:       `${BASE_URL}/peristiwa`,
  politik:      `${BASE_URL}/politik`,
  hukum:        `${BASE_URL}/politik`,
  uang:         `${BASE_URL}/uang`,
  ekonomi:      `${BASE_URL}/uang`,
  bisnis:       `${BASE_URL}/uang`,
  keuangan:     `${BASE_URL}/uang`,
  artis:        `${BASE_URL}/artis`,
  hiburan:      `${BASE_URL}/artis`,
  seleb:        `${BASE_URL}/artis`,
  trending:     `${BASE_URL}/trending`,
  viral:        `${BASE_URL}/trending`,
  teknologi:    `${BASE_URL}/teknologi`,
  tekno:        `${BASE_URL}/teknologi`,
  digital:      `${BASE_URL}/teknologi`,
  otomotif:     `${BASE_URL}/otomotif`,
  dunia:        `${BASE_URL}/dunia`,
  internasional:`${BASE_URL}/dunia`,
  gaya:         `${BASE_URL}/gaya`,
  'gaya hidup': `${BASE_URL}/gaya`,
  lifestyle:    `${BASE_URL}/gaya`,
  sehat:        `${BASE_URL}/sehat`,
  kesehatan:    `${BASE_URL}/sehat`,
  bolasport:    `${BASE_URL}/bolasport`,
  bola:         `${BASE_URL}/bolasport`,
  olahraga:     `${BASE_URL}/bolasport`,
  sport:        `${BASE_URL}/bolasport`,
};

// Segmen → label
const PATH_CATEGORY = {
  peristiwa:  'nasional',
  politik:    'nasional',
  uang:       'ekonomi',
  artis:      'hiburan',
  trending:   'trending',
  teknologi:  'teknologi',
  otomotif:   'otomotif',
  dunia:      'internasional',
  gaya:       'gaya hidup',
  sehat:      'kesehatan',
  bolasport:  'olahraga',
};

// Keyword → kategori fallback
const KEYWORD_CATEGORY_MAP = {
  dolar:       ['uang'],
  rupiah:      ['uang'],
  saham:       ['uang'],
  ihsg:        ['uang'],
  inflasi:     ['uang'],
  pajak:       ['uang', 'peristiwa'],
  bumn:        ['uang', 'peristiwa'],
  presiden:    ['politik'],
  prabowo:     ['politik', 'peristiwa'],
  korupsi:     ['politik'],
  kpk:         ['politik'],
  polri:       ['peristiwa'],
  timnas:      ['bolasport'],
  liga:        ['bolasport'],
  iphone:      ['teknologi'],
  ai:          ['teknologi'],
  startup:     ['teknologi', 'uang'],
  artis:       ['artis'],
  drakor:      ['artis'],
  film:        ['artis'],
  fashion:     ['gaya'],
  kuliner:     ['gaya'],
  gempa:       ['peristiwa'],
  banjir:      ['peristiwa'],
  israel:      ['dunia'],
  covid:       ['sehat', 'peristiwa'],
};

// ── Utilitas ───────────────────────────────────────────────────────────────

const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const sleep    = ms  => new Promise(r => setTimeout(r, ms));

function categoryFromUrl(url) {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    return PATH_CATEGORY[segments[0]] || segments[0] || 'umum';
  } catch { return 'umum'; }
}

/**
 * Validasi URL artikel Merdeka.
 * Ciri khas wajib: suffix -mvk.html + angka ID artikel sebelumnya.
 * Exclude foto & video.
 */
function isMerdekaArticleUrl(href) {
  if (!href || !href.startsWith('http')) return false;
  if (!href.includes('merdeka.com')) return false;
  if (!href.includes('-mvk.html')) return false;

  const excludes = [
    '/tag/', '/search', '/indeks', '/company/', '/redaksi',
    '#', 'javascript:', '/foto-', '/video-', '/foto/',
    '/special-content/', '/trending-article/', '/workstation/',
    '/infografis/',
  ];
  if (excludes.some(ex => href.includes(ex))) return false;

  try {
    const { pathname } = new URL(href);
    const segments = pathname.split('/').filter(Boolean);
    // Minimal 2 segmen & ID numerik ada di slug
    return segments.length >= 2 && /\d{5,}-mvk\.html$/.test(pathname);
  } catch { return false; }
}

// ── HTTP fetch dengan retry ────────────────────────────────────────────────

async function fetchPage(url, retries = MAX_RETRY) {
  await sleep(DELAY_MS + Math.random() * 300);
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

    // Judul — dari HTML asli: h1 di halaman artikel
    const title =
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim();

    // Konten — berdasarkan inspeksi HTML asli
    // Merdeka menggunakan div dengan paragraf langsung di body artikel
    const contentSelectors = [
      'div.article-body',
      'div[itemprop="articleBody"]',
      'div.article-content',
      'div#article-body',
      'section.article',
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
        '.ads', '.advertisement', 'noscript', '.share-button',
        '.tag-list', '.iklan', '.widget', '.ADVERTISEMENT',
      ].join(',')).remove();
      content = contentEl.text().replace(/\s+/g, ' ').trim();
    }

    // Fallback agresif: kumpulkan semua <p> yang cukup panjang
    if (!content || content.length < 100) {
      const parts = [];
      $('p').each((_, el) => {
        // Skip p di dalam nav, footer, aside
        const parent = $(el).parents('nav, footer, aside, header').length;
        if (parent > 0) return;
        const t = $(el).text().trim();
        if (t.length > 40) parts.push(t);
      });
      if (parts.length > 0) content = parts.join(' ').trim();
    }

    // Tanggal — dari meta article:published_time (terkonfirmasi ada di HTML)
    let published_date = null;
    const dateMeta =
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[itemprop="datePublished"]').attr('content') ||
      $('time').first().attr('datetime');

    if (dateMeta) {
      const d = new Date(dateMeta);
      if (!isNaN(d.getTime())) published_date = d.toISOString();
    }

    // Fallback teks — format "Rabu, 03 Jun 2026 15:09:59"
    if (!published_date) {
      const dateText = $('[class*="date"], [class*="time"]').first().text().trim();
      const MONTHS = {
        Jan:1, Feb:2, Mar:3, Apr:4, Mei:5, Jun:6,
        Jul:7, Agu:8, Sep:9, Okt:10, Nov:11, Des:12,
        Januari:1, Februari:2, Maret:3, April:4, Juni:6,
        Juli:7, Agustus:8, September:9, Oktober:10, November:11, Desember:12,
      };
      const match = dateText?.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
      if (match && MONTHS[match[2]]) {
        published_date = new Date(
          parseInt(match[3]), MONTHS[match[2]] - 1, parseInt(match[1])
        ).toISOString();
      }
    }

    const author =
      $('[itemprop="author"]').first().text().trim() ||
      $('meta[name="author"]').attr('content')?.trim() ||
      null;

    const image_url   = $('meta[property="og:image"]').attr('content') || null;
    const description = $('meta[property="og:description"]').attr('content')?.trim() || null;

    if (!title || title.length < 10) return null;
    if (!content || content.length < 80) {
      if (description?.length > 50) {
        return { title, content: description, url, source: 'merdeka',
          published_date, author, image_url, category: categoryFromUrl(url) };
      }
      return null;
    }

    return { title, content, url, source: 'merdeka',
      published_date, author, image_url, category: categoryFromUrl(url) };

  } catch (err) {
    console.error(`[Merdeka] Error parse ${url}:`, err.message);
    return null;
  }
}

// ── Kumpulkan URL dari halaman apapun ─────────────────────────────────────
// KUNCI PERBAIKAN: gunakan selector lebar `a[href*="-mvk.html"]`
// karena halaman listing Merdeka pakai React — konten utama tidak ada
// di HTML statis. Tapi sidebar "Berita Terbaru" SELALU ada.

async function extractUrlsFromPage(pageUrl) {
  const $ = await fetchPage(pageUrl);
  const links = new Set();

  // Selector lebar — tangkap semua <a> yang mengarah ke artikel Merdeka
  $('a[href*="-mvk.html"]').each((_, el) => {
    const href = $(el).attr('href');
    if (isMerdekaArticleUrl(href)) links.add(href.split('?')[0]);
  });

  return [...links];
}

// ── Strategi "artikel-hop" ────────────────────────────────────────────────
// Setiap halaman artikel Merdeka punya sidebar "Berita Terbaru" (5 artikel)
// dan "Berita Terpopuler". Dengan crawl beberapa artikel sekaligus,
// kita bisa dapat puluhan URL artikel.

async function articleHop(seedUrls, targetCount) {
  const allUrls  = new Set(seedUrls);
  const visited  = new Set();
  const queue    = [...seedUrls].slice(0, 3); // hop dari max 3 artikel seed

  for (const seedUrl of queue) {
    if (allUrls.size >= targetCount) break;
    if (visited.has(seedUrl)) continue;
    visited.add(seedUrl);

    try {
      const newUrls = await extractUrlsFromPage(seedUrl);
      newUrls.forEach(u => allUrls.add(u));
      console.log(`[Merdeka] Hop dari artikel → +${newUrls.length} URL (total: ${allUrls.size})`);
    } catch { /* skip */ }
  }

  return [...allUrls];
}

// ── Multi-kategori paralel ────────────────────────────────────────────────
// Scrape beberapa kategori sekaligus untuk mendapatkan lebih banyak URL

async function scrapeMultiCategory(categorySlugs) {
  console.log(`[Merdeka] Scraping multi-kategori paralel: ${categorySlugs.join(', ')}`);
  const results = await Promise.all(
    categorySlugs.map(slug =>
      extractUrlsFromPage(`${BASE_URL}/${slug}`).catch(() => [])
    )
  );
  return [...new Set(results.flat())];
}

// ── Search ────────────────────────────────────────────────────────────────

async function scrapeMerdekaSearch(query) {
  const searchUrl = `${BASE_URL}/search/${encodeURIComponent(query.replace(/\s+/g, '+'))}`;
  console.log(`[Merdeka] Scraping search: ${searchUrl}`);
  try {
    const urls = await extractUrlsFromPage(searchUrl);
    if (urls.length === 0) console.warn('[Merdeka] Search tidak menghasilkan URL.');
    return urls;
  } catch (err) {
    console.warn('[Merdeka] Search gagal:', err.message);
    return [];
  }
}

// ── Tag page ──────────────────────────────────────────────────────────────

async function scrapeTagPage(query) {
  const slug   = query.toLowerCase().replace(/\s+/g, '-');
  const tagUrl = `${BASE_URL}/tag/${encodeURIComponent(slug)}`;
  console.log(`[Merdeka] Scraping tag: ${tagUrl}`);
  try {
    return await extractUrlsFromPage(tagUrl);
  } catch (err) {
    console.warn(`[Merdeka] Tag page gagal:`, err.message);
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
      // Tidak ada query → multi-kategori default paralel
      console.log('[Merdeka] Scraping multi-kategori default...');
      urls = await scrapeMultiCategory(['peristiwa', 'uang', 'trending']);

    } else if (CATEGORY_URLS[qLower] && !dateFrom && !dateTo) {
      // Query cocok dengan kategori — ambil dari halaman kategori
      // PLUS kategori terdekat untuk volume lebih banyak
      const catSlug = CATEGORY_URLS[qLower].replace(`${BASE_URL}/`, '');
      console.log(`[Merdeka] Scraping kategori: ${catSlug}`);
      urls = await extractUrlsFromPage(CATEGORY_URLS[qLower]);

      // Jika kurang, hop dari artikel yang sudah dapat
      if (urls.length < maxArticles * 2) {
        urls = await articleHop(urls, maxArticles * 3);
      }

    } else {
      // Query bebas — coba berurutan

      // Strategi 1: Search
      urls = await scrapeMerdekaSearch(query);

      // Strategi 2: Tag page
      if (urls.length < maxArticles) {
        const tagUrls = await scrapeTagPage(query);
        urls = [...new Set([...urls, ...tagUrls])];
      }

      // Strategi 3: Multi-kategori relevan
      if (urls.length < maxArticles) {
        const cats = guessCategories(qLower);
        console.log(`[Merdeka] Fallback multi-kategori: ${cats.join(', ')}`);
        const catUrls = await scrapeMultiCategory(cats);
        urls = [...new Set([...urls, ...catUrls])];
      }

      // Strategi 4: Artikel-hop untuk volume lebih banyak
      if (urls.length < maxArticles * 2 && urls.length > 0) {
        urls = await articleHop(urls, maxArticles * 3);
      }
    }

    // Dedup & batasi
    urls = [...new Set(urls)].slice(0, maxArticles * 4);
    console.log(`[Merdeka] Total URLs dikumpulkan: ${urls.length}, mulai parse...`);

    const articles = [];
    for (const url of urls) {
      if (articles.length >= maxArticles * 2) break; // parse lebih banyak untuk antisipasi gagal
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