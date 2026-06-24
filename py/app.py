"""
Flask API — News Scraper Backend
Endpoint: POST /api/search/realtime
"""

import time
import uuid
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, date

from flask import Flask, request, jsonify
from flask_cors import CORS

from scraper import (
    crawl_listing,
    scrape_article,
    get_domain,
    is_article_url,
)

# ─────────────────────────────────────────────────────────────────
#  Setup
# ─────────────────────────────────────────────────────────────────

app = Flask(__name__)

# Izinkan request dari Next.js dev server maupun production
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:3000",
            "http://localhost:3001",
            "https://*.vercel.app",     # sesuaikan jika deploy
        ]
    }
})

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# Worker paralel untuk scraping artikel (atur sesuai RAM)
MAX_WORKERS = 5

# Maksimum artikel per request
MAX_ARTICLES = 30


# ─────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────

def parse_date_filter(filters: dict):
    """
    Kembalikan (date_from, date_to) sebagai objek date | None.
    Mendukung: date_preset (today / last_7_days / this_month / this_year)
               atau date_from / date_to string 'YYYY-MM-DD'.
    """
    today = date.today()
    preset = filters.get("date_preset", "")

    if preset == "today":
        return today, today
    if preset == "last_7_days":
        return today - timedelta(days=7), today
    if preset == "this_month":
        return today.replace(day=1), today
    if preset == "this_year":
        return today.replace(month=1, day=1), today

    # Tanggal manual
    df = filters.get("date_from")
    dt = filters.get("date_to")
    try:
        d_from = datetime.strptime(df, "%Y-%m-%d").date() if df else None
        d_to   = datetime.strptime(dt, "%Y-%m-%d").date() if dt else None
        return d_from, d_to
    except (ValueError, TypeError):
        return None, None


def parse_article_date(raw: str) -> date | None:
    """Coba parse string tanggal dari berbagai format."""
    if not raw:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d",
                "%d/%m/%Y", "%d %B %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(raw[:len(fmt) + 2].strip(), fmt).date()
        except ValueError:
            continue
    return None


def article_to_response(art: dict, idx: int) -> dict:
    """Konversi dict scraper ke format response API (cocok dengan frontend)."""
    return {
        "id":             art.get("id") or str(uuid.uuid4()),
        "url":            art["url"],
        "title":          art["title"] or "(Judul tidak ditemukan)",
        "content":        art["content"],
        "source":         art["domain"],
        "published_date": art["date"] or None,
        "author":         art["author"],
        "category":       art["category"],
        "word_count":     art["word_count"],
        "scraped_at":     art["scraped_at"],
        # distance: None → frontend skip badge score
        "distance":       None,
    }


def filter_by_date(articles: list, filters: dict) -> list:
    """Filter artikel berdasarkan tanggal jika ada filter aktif."""
    d_from, d_to = parse_date_filter(filters)
    if not d_from and not d_to:
        return articles

    result = []
    for art in articles:
        art_date = parse_article_date(art.get("date", ""))
        if art_date is None:
            # Kalau tanggal tidak terbaca, tetap masukkan (jangan buang)
            result.append(art)
            continue
        if d_from and art_date < d_from:
            continue
        if d_to and art_date > d_to:
            continue
        result.append(art)
    return result


def scrape_parallel(urls: list, max_workers: int = MAX_WORKERS) -> list:
    """Scrape banyak URL secara paralel, kembalikan list hasil."""
    results = [None] * len(urls)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_idx = {
            executor.submit(scrape_article, url): i
            for i, url in enumerate(urls)
        }
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                results[idx] = future.result()
            except Exception as e:
                log.warning(f"Gagal scrape [{urls[idx]}]: {e}")
                results[idx] = None
    return [r for r in results if r is not None]


# ─────────────────────────────────────────────────────────────────
#  Routes
# ─────────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "timestamp": datetime.utcnow().isoformat()})


@app.route("/api/search/realtime", methods=["POST"])
def search_realtime():
    """
    Request body (JSON):
    {
        "query":       "string (opsional)",
        "custom_urls": ["https://portal1.com", ...],   // wajib di mode auto
        "top_k":       10,
        "mode":        "auto",
        "filters": {
            "date_preset": "today" | "last_7_days" | "this_month" | "this_year" | "",
            "date_from":   "YYYY-MM-DD",
            "date_to":     "YYYY-MM-DD"
        }
    }

    Response:
    {
        "results":    [...],
        "total":      10,
        "query_time": 3.14,
        "mode":       "auto"
    }
    """
    t_start = time.perf_counter()
    body = request.get_json(silent=True) or {}

    query       = (body.get("query") or "").strip()
    custom_urls = body.get("custom_urls") or []
    top_k       = min(int(body.get("top_k") or 10), MAX_ARTICLES)
    mode        = body.get("mode") or "auto"
    filters     = body.get("filters") or {}

    log.info(f"[{mode}] query='{query}' urls={len(custom_urls)} top_k={top_k} filters={filters}")

    # ── Validasi ──────────────────────────────────────────────────
    if mode == "auto" and not custom_urls:
        return jsonify({"error": "custom_urls wajib diisi di mode auto"}), 400

    # Bersihkan & validasi URL input
    valid_urls = []
    for u in custom_urls:
        u = u.strip()
        if u.startswith("http"):
            valid_urls.append(u)
    if mode == "auto" and not valid_urls:
        return jsonify({"error": "Tidak ada URL valid yang diberikan"}), 400

    # ── Crawl listing → kumpulkan URL artikel ─────────────────────
    article_urls = []
    errors       = []

    for listing_url in valid_urls:
        try:
            found = crawl_listing(listing_url, jumlah=top_k)
            log.info(f"  {listing_url} → {len(found)} artikel")
            article_urls.extend(found)
        except Exception as e:
            log.warning(f"  Gagal crawl {listing_url}: {e}")
            errors.append(str(e))

    # Deduplikasi
    seen = set()
    unique_urls = []
    for u in article_urls:
        if u not in seen:
            seen.add(u)
            unique_urls.append(u)

    # Batasi total
    unique_urls = unique_urls[:top_k]
    log.info(f"Total artikel unik untuk di-scrape: {len(unique_urls)}")

    if not unique_urls:
        return jsonify({
            "results":    [],
            "total":      0,
            "query_time": round(time.perf_counter() - t_start, 3),
            "mode":       mode,
            "errors":     errors,
            "message":    "Tidak ada artikel ditemukan. Periksa URL yang dimasukkan.",
        })

    # ── Scrape paralel ────────────────────────────────────────────
    scraped = scrape_parallel(unique_urls, max_workers=MAX_WORKERS)

    # ── Filter tanggal ────────────────────────────────────────────
    if filters:
        scraped = filter_by_date(scraped, filters)

    # ── Keyword filter sederhana (jika ada query) ─────────────────
    if query:
        q_lower = query.lower()
        def relevance_score(art):
            text = f"{art['title']} {art['content']}".lower()
            return text.count(q_lower)
        # Sort by keyword frequency, buang yg 0 jika ada hasil lain
        with_score = [(art, relevance_score(art)) for art in scraped]
        matched = [(a, s) for a, s in with_score if s > 0]
        if matched:
            matched.sort(key=lambda x: x[1], reverse=True)
            scraped = [a for a, _ in matched]
        # Kalau tidak ada yang cocok, tetap return semua (jangan kosong)

    # ── Format response ───────────────────────────────────────────
    results = [article_to_response(art, i) for i, art in enumerate(scraped)]

    query_time = round(time.perf_counter() - t_start, 3)
    log.info(f"Selesai: {len(results)} artikel dalam {query_time}s")

    return jsonify({
        "results":    results,
        "total":      len(results),
        "query_time": query_time,
        "mode":       mode,
        "errors":     errors if errors else [],
    })


# ─────────────────────────────────────────────────────────────────
#  Run
# ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)