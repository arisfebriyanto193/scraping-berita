"""
News Scraper - Universal — Bekerja di portal berita manapun
Tidak ada aturan khusus per portal, semua URL bisa diproses.
"""

import re
import sys
import json
import time
import textwrap
from datetime import datetime
from urllib.parse import urlparse, urljoin

import requests
from bs4 import BeautifulSoup

try:
    from readability import Document as ReadabilityDocument
    HAS_READABILITY = True
except ImportError:
    HAS_READABILITY = False


# ═══════════════════════════════════════════════════════════════
#  ★  KONFIGURASI — edit bagian ini saja
# ═══════════════════════════════════════════════════════════════

# URL halaman sumber berita (bisa homepage, kategori, atau tag)
SUMBER_BERITA = "https://www.detik.com/"

# Berapa banyak artikel yang ingin diambil?
JUMLAH_BERITA = 15

# Jeda antar request (detik) — hindari banned
DELAY_DETIK = 1.0

# ═══════════════════════════════════════════════════════════════


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://www.google.com/",
}

WIDTH = 72

# Ekstensi file yang pasti bukan artikel
_SKIP_EXT = re.compile(
    r"\.(jpg|jpeg|png|gif|webp|svg|css|js|json|xml|pdf|zip|mp3|mp4|woff2?|ttf)$",
    re.I,
)

# Segmen path 
_SKIP_PATH = re.compile(
    r"/(tag|tags|category|kategori|search|pencarian|page|author|penulis|"
    r"login|register|about|contact|advertise|privacy|terms|sitemap|feed|rss|"
    r"video|photo|foto|galeri|gallery|podcast|live|amp)(/|$)",
    re.I,
)

# Petunjuk bahwa sebuah path kemungkinan ARTIKEL
_ARTICLE_HINTS = re.compile(
    r"/(artikel|berita|news|read|baca|detail|story|post|[0-9]{4}/[0-9]{2})",
    re.I,
)


# ───────────────────────────────────────────────────────────────
#  HELPER DASAR
# ───────────────────────────────────────────────────────────────

def get_domain(url: str) -> str:
    parsed = urlparse(url)
    parts  = parsed.netloc.replace("www.", "").split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else parsed.netloc


def fetch_html(url: str, timeout: int = 15) -> str | None:
    for attempt in range(2):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=timeout)
            resp.raise_for_status()
            return resp.text
        except requests.RequestException as e:
            if attempt == 0:
                time.sleep(1)
                continue
            print(f"    ✗ Gagal: {e}")
    return None


def clean_text(text: str) -> str:
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


# ───────────────────────────────────────────────────────────────
#  UNIVERSAL: SCORING LINK
# ───────────────────────────────────────────────────────────────

def _score_link(url: str, base_domain: str, anchor_text: str = "") -> int:
    """
    Beri skor heuristik pada sebuah link.
    Semakin tinggi skor → semakin besar kemungkinan itu halaman artikel.
    Kembalikan -1 jika pasti bukan artikel.
    """
    parsed = urlparse(url)

    # Harus domain yang sama atau subdomain-nya
    if base_domain not in parsed.netloc:
        return -1

    path = parsed.path

    # Pasti bukan artikel
    if _SKIP_EXT.search(path):
        return -1
    if _SKIP_PATH.search(path):
        return -1

    # Fragment-only atau root
    if not path or path == "/":
        return -1

    score = 0
    segments = [s for s in path.split("/") if s]

    # Path cukup dalam (≥ 2 segmen)
    if len(segments) >= 2:
        score += 1
    if len(segments) >= 3:
        score += 1

    # Path cukup panjang
    if len(path) > 30:
        score += 1
    if len(path) > 60:
        score += 1

    # Mengandung angka (ID artikel, tanggal, dsb.)
    if re.search(r"\d{4,}", path):
        score += 2

    # Mengandung tanggal di path (YYYY/MM)
    if re.search(r"/\d{4}/\d{2}/", path):
        score += 2

    # Mengandung kata kunci khas artikel
    if _ARTICLE_HINTS.search(path):
        score += 2

    # Slug panjang dengan tanda hubung (biasanya judul artikel)
    last_seg = segments[-1] if segments else ""
    if last_seg.count("-") >= 3:
        score += 2

    # Anchor text panjang (biasanya judul artikel)
    if len(anchor_text.strip()) > 20:
        score += 1

    return score


def is_article_url(url: str, domain: str) -> bool:
    """Deteksi apakah URL kemungkinan halaman artikel (universal, tanpa whitelist portal)."""
    return _score_link(url, domain) >= 3


# ───────────────────────────────────────────────────────────────
#  UNIVERSAL: EKSTRAKSI METADATA ARTIKEL
# ───────────────────────────────────────────────────────────────

def _get_meta(soup: BeautifulSoup, *args) -> str:
    """Coba beberapa pasangan (attr, val) meta tag, kembalikan value pertama."""
    for attr, val in args:
        tag = soup.find("meta", {attr: val})
        if tag and tag.get("content"):
            return tag["content"].strip()
    return ""


def _parse_jsonld(soup: BeautifulSoup) -> dict:
    """Ambil data JSON-LD pertama yang ditemukan."""
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            if isinstance(data, list):
                data = data[0]
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return {}


def _extract_title(soup: BeautifulSoup, ld: dict) -> str:
    # 1. Open Graph / Twitter Card
    t = _get_meta(soup, ("property", "og:title"), ("name", "twitter:title"))
    if t:
        return t
    # 2. JSON-LD
    for key in ("headline", "name"):
        if ld.get(key):
            return str(ld[key]).strip()
    # 3. <h1>
    h1 = soup.find("h1")
    if h1:
        return h1.get_text(strip=True)
    # 4. <title>
    if soup.title and soup.title.string:
        return soup.title.string.strip()
    return ""


def _extract_author(soup: BeautifulSoup, ld: dict) -> str:
    # 1. Meta standar
    t = _get_meta(
        soup,
        ("name", "author"),
        ("property", "article:author"),
        ("name", "twitter:creator"),
    )
    if t:
        return t
    # 2. JSON-LD
    author = ld.get("author")
    if isinstance(author, dict):
        return author.get("name", "").strip()
    if isinstance(author, str) and author.strip():
        return author.strip()
    # 3. Selector umum
    for sel in [
        "[class*='author']", "[class*='reporter']", "[class*='writer']",
        "[rel='author']", "[itemprop='author']",
    ]:
        el = soup.select_one(sel)
        if el:
            text = el.get_text(strip=True)
            if text and len(text) < 80:
                return text
    return ""


def _extract_date(soup: BeautifulSoup, ld: dict) -> str:
    # 1. Meta standar
    t = _get_meta(
        soup,
        ("property", "article:published_time"),
        ("name", "publishdate"),
        ("name", "date"),
        ("itemprop", "datePublished"),
        ("property", "og:updated_time"),
    )
    if t:
        return t[:19].replace("T", " ")
    # 2. JSON-LD
    for key in ("datePublished", "dateCreated", "dateModified"):
        if ld.get(key):
            return str(ld[key])[:19].replace("T", " ")
    # 3. <time> tag
    time_tag = soup.find("time")
    if time_tag:
        return time_tag.get("datetime", "") or time_tag.get_text(strip=True)
    # 4. Selector umum
    for sel in ["[class*='date']", "[class*='time']",
                "[class*='published']", "[class*='timestamp']"]:
        el = soup.select_one(sel)
        if el:
            text = el.get_text(strip=True)
            if text and len(text) < 50:
                return text
    return ""


def _extract_category(soup: BeautifulSoup, ld: dict) -> str:
    # 1. Meta standar
    t = _get_meta(soup, ("property", "article:section"), ("name", "section"))
    if t:
        return t
    # 2. JSON-LD
    if ld.get("articleSection"):
        return str(ld["articleSection"])
    # 3. Breadcrumb / selector umum
    for sel in [
        ".breadcrumb li:last-child", "[class*='breadcrumb'] li:last-child",
        "[class*='category']", "[class*='tag']",
    ]:
        el = soup.select_one(sel)
        if el:
            text = el.get_text(strip=True)
            if text and len(text) < 60:
                return text
    return ""


def _extract_content(soup: BeautifulSoup, html: str) -> str:
    """Ekstraksi konten artikel universal — tanpa aturan portal khusus."""

    # 1. readability-lxml (paling akurat jika tersedia)
    if HAS_READABILITY:
        try:
            doc     = ReadabilityDocument(html)
            content = BeautifulSoup(doc.summary(), "lxml").get_text(separator="\n", strip=True)
            if len(content) > 200:
                return content
        except Exception:
            pass

    # 2. Cari container artikel via selector generik
    CONTENT_SELECTORS = [
        "[itemprop='articleBody']",
        "article",
        "[class*='article-body']", "[class*='article-content']",
        "[class*='post-content']",  "[class*='entry-content']",
        "[class*='story-body']",    "[class*='news-body']",
        "[class*='detail-body']",   "[class*='body-text']",
        "[class*='content-detail']","[class*='detail-text']",
        "main",
    ]
    for sel in CONTENT_SELECTORS:
        container = soup.select_one(sel)
        if not container:
            continue
        paragraphs = container.find_all(["p", "h2", "h3", "h4", "blockquote"])
        text = "\n\n".join(
            p.get_text(separator=" ", strip=True)
            for p in paragraphs
            if len(p.get_text(strip=True)) > 30
        )
        if len(text) > 200:
            return text

    # 3. Fallback terakhir: kumpulkan semua <p> substansial
    for tag in soup(["script", "style", "nav", "header", "footer",
                     "aside", "form", "iframe", "noscript"]):
        tag.decompose()
    paragraphs = soup.find_all("p")
    content = "\n\n".join(
        p.get_text(separator=" ", strip=True)
        for p in paragraphs
        if len(p.get_text(strip=True)) > 40
    )
    return content


# ───────────────────────────────────────────────────────────────
#  CRAWL LISTING → KUMPULKAN URL ARTIKEL
# ───────────────────────────────────────────────────────────────
def crawl_listing(listing_url: str, jumlah: int) -> list:
    """
    Ambil halaman listing/homepage, ekstrak link artikel.
    Kembalikan list URL artikel (maksimal `jumlah`).
    Bekerja universal untuk portal apapun — tanpa whitelist domain.
    """
    domain = get_domain(listing_url)

    print(f"  🔍 Crawl listing: {listing_url}")
    html = fetch_html(listing_url)
    if not html:
        return []

    soup   = BeautifulSoup(html, "lxml")
    scored = []
    seen   = set()

    for a in soup.find_all("a", href=True):
        href   = a.get("href", "")
        full   = urljoin(listing_url, href).split("#")[0].rstrip("/")
        if not full or full in seen:
            continue

        anchor = a.get_text(strip=True)
        score  = _score_link(full, domain, anchor)
        if score < 3:
            continue

        seen.add(full)
        scored.append((score, full))

    # Sort: skor tertinggi dulu (link paling "mirip artikel" tampil duluan)
    scored.sort(key=lambda x: x[0], reverse=True)
    result = [url for _, url in scored[:jumlah]]

    print(f"  📋 Ditemukan {len(scored)} link artikel, mengambil {len(result)}")
    return result


# ───────────────────────────────────────────────────────────────
#  SCRAPE SATU ARTIKEL (UNIVERSAL)
# ───────────────────────────────────────────────────────────────

def scrape_article(url: str) -> dict:
    result = {
        "url":        url,
        "domain":     get_domain(url),
        "title":      "",
        "author":     "",
        "date":       "",
        "category":   "",
        "content":    "",
        "word_count": 0,
        "scraped_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    html = fetch_html(url)
    if not html:
        return result

    soup = BeautifulSoup(html, "lxml")
    ld   = _parse_jsonld(soup)   # JSON-LD structured data (sekali parse, reuse)

    result["title"]    = _extract_title(soup, ld)
    result["author"]   = _extract_author(soup, ld)
    result["date"]     = _extract_date(soup, ld)
    result["category"] = _extract_category(soup, ld)
    result["content"]  = clean_text(_extract_content(soup, html))
    result["word_count"] = len(result["content"].split())

    return result


# ───────────────────────────────────────────────────────────────
#  DISPLAY
# ───────────────────────────────────────────────────────────────

def divider(char="─"):
    print(char * WIDTH)


def print_article(art: dict, index: int, total: int):
    print()
    print("═" * WIDTH)
    print(f"  ARTIKEL {index}/{total}  —  {art['domain'].upper()}")
    print("═" * WIDTH)

    print(f"\n📰  JUDUL")
    judul = art["title"] or "(tidak ditemukan)"
    for line in textwrap.wrap(judul, WIDTH - 4):
        print(f"    {line}")

    print()
    divider()
    meta = []
    if art["author"]:    meta.append(f"✍  Penulis  : {art['author']}")
    if art["date"]:      meta.append(f"🗓  Tanggal  : {art['date']}")
    if art["category"]:  meta.append(f"🏷  Kategori : {art['category']}")
    meta.append(f"🔗  URL      : {art['url']}")
    meta.append(f"⏱  Diambil  : {art['scraped_at']}")
    print("\n".join(meta))
    divider()

    print(f"\n📄  ISI ARTIKEL  ({art['word_count']} kata)\n")
    if art["content"]:
        for para in art["content"].split("\n\n"):
            print(textwrap.fill(
                para, width=WIDTH - 4,
                initial_indent="    ", subsequent_indent="    "
            ))
            print()
    else:
        print("    (Konten tidak berhasil diekstrak)")

    print("═" * WIDTH)


def print_ringkasan(articles: list):
    """Cetak ringkasan semua artikel di akhir."""
    print()
    print("╔" + "═" * (WIDTH - 2) + "╗")
    print("║" + "  RINGKASAN HASIL".center(WIDTH - 2) + "║")
    print("╚" + "═" * (WIDTH - 2) + "╝")
    berhasil = [a for a in articles if a["content"]]
    gagal    = [a for a in articles if not a["content"]]
    print(f"\n  ✅  Berhasil : {len(berhasil)} artikel")
    if gagal:
        print(f"  ⚠️   Kosong   : {len(gagal)} artikel (konten tidak terbaca)")
    print(f"\n  {'No':<4} {'Judul':<44} {'Kata':>5}")
    print(f"  {'─'*4} {'─'*44} {'─'*5}")
    for i, a in enumerate(articles, 1):
        judul = (a["title"] or "(?)") [:43]
        print(f"  {i:<4} {judul:<44} {a['word_count']:>5}")
    print()


# ───────────────────────────────────────────────────────────────
#  MAIN
# ───────────────────────────────────────────────────────────────

def main():
    # Bisa override dari command line:
    # python scraper.py https://url.com 15
    sumber = sys.argv[1] if len(sys.argv) > 1 else SUMBER_BERITA
    jumlah = int(sys.argv[2]) if len(sys.argv) > 2 else JUMLAH_BERITA

    print()
    print("╔" + "═" * (WIDTH - 2) + "╗")
    print("║" + "  NEWS SCRAPER UNIVERSAL — Semua Portal Berita".center(WIDTH - 2) + "║")
    print("╚" + "═" * (WIDTH - 2) + "╝")
    print(f"\n  Sumber  : {sumber}")
    print(f"  Target  : {jumlah} artikel")
    print()

    # ── Tahap 1: crawl listing ──
    article_urls = crawl_listing(sumber, jumlah)

    if not article_urls:
        print("\n  ❌  Tidak ada link artikel yang ditemukan.")
        print("     Coba URL kategori/tag yang lebih spesifik.")
        sys.exit(1)

    print()

    # ── Tahap 2: scrape tiap artikel ──
    articles = []
    for i, url in enumerate(article_urls, 1):
        print(f"  [{i:>2}/{len(article_urls)}] {url[:65]}...")
        art = scrape_article(url)
        articles.append(art)
        print_article(art, i, len(article_urls))
        if i < len(article_urls):
            time.sleep(DELAY_DETIK)

    # ── Tahap 3: ringkasan ──
    print_ringkasan(articles)


if __name__ == "__main__":
    main()
