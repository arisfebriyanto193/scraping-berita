/**
 * search.js - Route untuk realtime search
 * POST /realtime/search
 *
 * Mode Scraping:
 * - mode: 'kurasi'  → Scrape dari 10 portal yang sudah dikonfigurasi
 * - mode: 'auto'    → Universal crawler, scrape dari custom_urls yang diberikan user
 *
 * Alur:
 * 1. Terima query + mode + custom_urls + filters dari frontend
 * 2. Scrape berita dari sumber yang relevan secara paralel
 * 3. Hitung sentence embedding untuk query dan semua artikel
 * 4. Hitung cosine similarity, urutkan ascending (distance terkecil = paling relevan)
 * 5. Terapkan filter tanggal jika ada
 * 6. Return hasil ke frontend
 */

import express from 'express';
import { scrapeDetik } from '../scrapers/detik.js';
import { scrapeKompas } from '../scrapers/kompas.js';
import { scrapeCNN } from '../scrapers/cnn.js';
import { scrapeRepublika } from '../scrapers/republika.js';
import { scrapeTribun } from '../scrapers/tribun.js';
import { scrapeAntara } from '../scrapers/antara.js';
import { scrapeLiputan6 } from '../scrapers/liputan6.js';
import { scrapeSindo } from '../scrapers/sindo.js';
import { scrapeCNBC } from '../scrapers/cnbcindonesia.js';
import { scrapeOkezone } from '../scrapers/okezone.js';
import { scrapeMultiplePortals } from '../scrapers/universal.js';
import { embedTexts, cosineSimilarity } from '../services/embedder.js';

const router = express.Router();

const MAX_PER_SOURCE = parseInt(process.env.MAX_ARTICLES_PER_SOURCE || '5');

/**
 * Filter artikel berdasarkan rentang tanggal
 */
function applyDateFilter(articles, date_from, date_to) {
  return articles.filter(article => {
    if (!article.published_date) return true;

    const pubDate = new Date(article.published_date);
    if (isNaN(pubDate.getTime())) return true;

    if (date_from) {
      const from = new Date(date_from);
      from.setHours(0, 0, 0, 0);
      if (pubDate < from) return false;
    }

    if (date_to) {
      const to = new Date(date_to);
      to.setHours(23, 59, 59, 999);
      if (pubDate > to) return false;
    }

    return true;
  });
}

/**
 * POST /realtime/search
 * Body: {
 *   query,
 *   mode?          'auto' | 'kurasi'  (default: 'kurasi')
 *   custom_urls?,  array URL portal untuk mode auto
 *   sources?,      array nama portal untuk mode kurasi
 *   date_from?,
 *   date_to?,
 *   top_k?
 * }
 */
router.post('/search', async (req, res) => {
  const startTime = Date.now();

  const {
    query,
    mode = 'kurasi',
    custom_urls = [],
    sources = ['detik', 'kompas', 'cnn', 'republika', 'tribun', 'antara', 'liputan6', 'sindo', 'cnbcindonesia', 'okezone'],
    date_from,
    date_to,
    top_k = 10,
  } = req.body;

  if (query === undefined || query === null) {
    return res.status(400).json({ error: 'Query parameter is required (can be empty string)' });
  }

  console.log(`\n[Search] Query: "${query}" | Mode: ${mode} | Sources: ${mode === 'auto' ? custom_urls.join(', ') : sources.join(', ')}`);

  try {
    let allArticles = [];

    // ─────────────────────────────────────────────
    // STEP 1: Scraping berdasarkan mode
    // ─────────────────────────────────────────────

    if (mode === 'auto') {
      // Mode Auto: Universal crawler dari URL yang diberikan user
      if (!custom_urls || custom_urls.length === 0) {
        return res.status(400).json({ error: 'Mode auto membutuhkan minimal 1 URL portal (custom_urls)' });
      }

      const validUrls = custom_urls
        .map(u => u.trim())
        .filter(u => {
          try { new URL(u); return true; } catch { return false; }
        });

      if (validUrls.length === 0) {
        return res.status(400).json({ error: 'Tidak ada URL valid yang diberikan' });
      }

      console.log(`[Search] Mode AUTO — Scraping ${validUrls.length} portal secara universal...`);
      allArticles = await scrapeMultiplePortals(validUrls, MAX_PER_SOURCE, query);

    } else {
      // Mode Kurasi: Scrape dari portal yang sudah dikonfigurasi
      const scraperMap = {
        detik: () => scrapeDetik(query, MAX_PER_SOURCE, date_from, date_to),
        kompas: () => scrapeKompas(query, MAX_PER_SOURCE, date_from, date_to),
        cnn: () => scrapeCNN(query, MAX_PER_SOURCE, date_from, date_to),
        republika: () => scrapeRepublika(query, MAX_PER_SOURCE, date_from, date_to),
        tribun: () => scrapeTribun(query, MAX_PER_SOURCE, date_from, date_to),
        antara: () => scrapeAntara(query, MAX_PER_SOURCE, date_from, date_to),
        liputan6: () => scrapeLiputan6(query, MAX_PER_SOURCE, date_from, date_to),
        sindo: () => scrapeSindo(query, MAX_PER_SOURCE, date_from, date_to),
        cnbcindonesia: () => scrapeCNBC(query, MAX_PER_SOURCE, date_from, date_to),
        okezone: () => scrapeOkezone(query, MAX_PER_SOURCE, date_from, date_to),
      };

      const activeScrapers = sources
        .filter(s => scraperMap[s])
        .map(s => scraperMap[s]());

      console.log(`[Search] Mode KURASI — Menjalankan ${activeScrapers.length} scraper secara paralel...`);
      const scrapedArrays = await Promise.allSettled(activeScrapers);

      for (const result of scrapedArrays) {
        if (result.status === 'fulfilled') {
          allArticles = allArticles.concat(result.value);
        } else {
          console.error('[Search] Scraper error:', result.reason?.message);
        }
      }
    }

    console.log(`[Search] Total artikel terkumpul: ${allArticles.length}`);

    if (allArticles.length === 0) {
      return res.json({
        results: [],
        total: 0,
        query_time: (Date.now() - startTime) / 1000,
        message: mode === 'auto'
          ? 'Tidak ada artikel berhasil di-scrape. Pastikan URL portal berita valid dan dapat diakses.'
          : 'Tidak ada artikel berhasil di-scrape',
      });
    }

    // ─────────────────────────────────────────────
    // STEP 2: Terapkan filter tanggal
    // ─────────────────────────────────────────────
    if (date_from || date_to) {
      allArticles = applyDateFilter(allArticles, date_from, date_to);
      console.log(`[Search] Setelah filter tanggal: ${allArticles.length} artikel`);
    }

    if (allArticles.length === 0) {
      return res.json({
        results: [],
        total: 0,
        query_time: (Date.now() - startTime) / 1000,
        message: 'Tidak ada artikel dalam rentang tanggal yang dipilih',
      });
    }

    // ─────────────────────────────────────────────
    // STEP 3 & 4: Hitung Sentence Embedding
    // ─────────────────────────────────────────────
    let results = [];
    if (query.trim()) {
      console.log(`[Search] Menghitung embedding untuk query dan ${allArticles.length} artikel...`);

      const textsToEmbed = [
        query,
        ...allArticles.map(a => `${a.title} ${a.title} ${a.title} ${a.content.substring(0, 250)}`),
      ];

      const embeddings = await embedTexts(textsToEmbed);
      const queryEmbedding = embeddings[0];
      const articleEmbeddings = embeddings.slice(1);

      const scored = allArticles.map((article, i) => {
        const similarity = cosineSimilarity(queryEmbedding, articleEmbeddings[i]);
        const distance = Math.max(0, 1 - similarity);
        return {
          ...article,
          similarity_score: similarity,
          distance: parseFloat(distance.toFixed(4)),
        };
      });

      scored.sort((a, b) => a.distance - b.distance);
      results = scored.slice(0, top_k);
    } else {
      console.log(`[Search] Tanpa query, mengembalikan artikel terbaru langsung...`);
      results = allArticles.slice(0, top_k);
    }

    const queryTime = (Date.now() - startTime) / 1000;

    console.log(`[Search] ✅ Selesai dalam ${queryTime.toFixed(2)} detik. Mengembalikan ${results.length} hasil.`);

    res.json({
      results,
      total: results.length,
      total_scraped: allArticles.length,
      query_time: queryTime,
      mode,
    });

  } catch (err) {
    console.error('[Search] Error:', err);
    res.status(500).json({
      error: 'Terjadi kesalahan server',
      detail: err.message,
    });
  }
});

export default router;
