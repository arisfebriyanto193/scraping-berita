"""
News Scraper - Ambil berita dari halaman portal / listing otomatis
Tinggal set SUMBER_BERITA dan JUMLAH_BERITA, lalu jalankan.
"""

import re
import sys
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
JUMLAH_BERITA = 10

# Jeda antar request (detik) — hindari banned
DELAY_DETIK = 1.0

# ═══════════════════════════════════════════════════════════════


# ── Pola URL artikel per portal ────────────────────────────────
# Dipakai untuk menyaring link mana yang merupakan artikel berita
ARTICLE_URL_PATTERNS = {
    "detik.com":        r"/[a-z-]+/[a-z-]+/d-\d+/",
    "kompas.com":       r"/read/\d{4}/\d{2}/\d{2}/",
    "cnnindonesia.com": r"/[a-z-]+/\d{8}\d+-\d+-\d+/",
    "tribunnews.com":   r"/[a-z-]+/\d{4}/\d{2}/\d{2}/",
    "antaranews.com":   r"/berita/\d+/",
    "liputan6.com":     r"/[a-z-]+/read/\d+/",
    "okezone.com":      r"/read/\d{4}/\d{2}/\d{2}/",
    "sindonews.com":    r"/artikel/\d+/",
    "republika.co.id":  r"/berita/[a-z-]+/[a-z-]+/\d+/",
    "merdeka.com":      r"/[a-z-]+/[a-z0-9-]+\.html",
}

# ── CSS selector artikel per portal ────────────────────────────
PORTAL_RULES = {
    "detik.com": {
        "listing": ["article a", ".list-content__item a", "h2 a", "h3 a"],
        "title":   ["h1.detail__title", "h1[class*='title']", "h1"],
        "author":  [".detail__author", "[class*='author']"],
        "date":    [".detail__date", "[class*='date']", "time"],
        "content": [".detail__body-text", "[class*='body-text']"],
        "category":["[class*='kategori']", ".breadcrumb li:last-child"],
    },
    "kompas.com": {
        "listing": [".latest--article a", ".article__link", "h3 a", "h2 a"],
        "title":   ["h1.read__title", "h1[class*='title']", "h1"],
        "author":  [".credit-title-name", "[class*='author']"],
        "date":    [".read__time", "time[itemprop='datePublished']"],
        "content": ["div.read__content", "[class*='article-content']"],
        "category":["[class*='tag']", ".breadcrumb li:last-child"],
    },
    "cnnindonesia.com": {
        "listing": [".container article a", "h2 a", ".list_berita a"],
        "title":   ["h1.title", "h1[class*='detail-title']", "h1"],
        "author":  [".detail-author", "[class*='author']"],
        "date":    [".detail-date", "time", "[class*='pubdate']"],
        "content": [".detail-text", "[class*='detail-text']"],
        "category":[".breadcrumb li:last-child"],
    },
    "tribunnews.com": {
        "listing": [".lsi-wrap a", ".mli-pnld a", "h3 a", "h2 a"],
        "title":   ["h1#arttitle", "h1[class*='title']", "h1"],
        "author":  [".side-article-tag", "[class*='author']"],
        "date":    ["time", "[class*='time']"],
        "content": ["div#article-2", "div[class*='side-article-body']"],
        "category":[".breadcrumb li:last-child"],
    },
    "antaranews.com": {
        "listing": [".simple-list a", "h2 a", "h3 a", ".card a"],
        "title":   ["h1[class*='title']", "h1"],
        "author":  ["[class*='author']", "[rel='author']"],
        "date":    ["span[class*='date']", "time"],
        "content": ["div[class*='post-content']", "article"],
        "category":["[class*='tag']"],
    },
    "liputan6.com": {
        "listing": [".articles--iridescent-list a", "h4 a", "h3 a"],
        "title":   ["h1.read-page--header--title", "h1[class*='title']", "h1"],
        "author":  ["[class*='article-author']", "[class*='author']"],
        "date":    ["[class*='read-page--header--author__info']", "time"],
        "content": ["[class*='article-content-body__item-content']"],
        "category":[".breadcrumb li:last-child"],
    },
    "okezone.com": {
        "listing": [".list-berita a", "h4 a", "h3 a"],
        "title":   ["h1[class*='title']", "h1.mt0", "h1"],
        "author":  ["[class*='reporter']", "[class*='author']"],
        "date":    ["[class*='date']", "time"],
        "content": ["[class*='detail-content']", "div#contentx"],
        "category":[".breadcrumb li:last-child"],
    },
}

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


# ───────────────────────────────────────────────────────────────
#  HELPER
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


def try_selectors(soup: BeautifulSoup, selectors: list) -> str:
    for sel in selectors:
        el = soup.select_one(sel)
        if el:
            return el.get_text(strip=True)
    return ""


def extract_content_text(soup: BeautifulSoup, selectors: list) -> str:
    for sel in selectors:
        container = soup.select_one(sel)
        if container:
            paragraphs = container.find_all(["p", "h2", "h3", "h4", "blockquote"])
            text = "\n\n".join(
                p.get_text(separator=" ", strip=True)
                for p in paragraphs
                if p.get_text(strip=True)
            )
            if len(text) > 200:
                return text
    return ""


def fallback_extract(html: str) -> dict:
    """Ekstraksi otomatis tanpa aturan portal khusus."""
    # Coba readability dulu
    if HAS_READABILITY:
        try:
            doc     = ReadabilityDocument(html)
            title   = doc.title()
            content = BeautifulSoup(doc.summary(), "lxml").get_text(separator="\n", strip=True)
            if len(content) > 200:
                return {"title": title, "content": content}
        except Exception:
            pass

    # Fallback: kumpulkan semua <p> substansial
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "header", "footer",
                     "aside", "form", "iframe", "noscript"]):
        tag.decompose()
    paragraphs = soup.find_all("p")
    content = "\n\n".join(
        p.get_text(separator=" ", strip=True)
        for p in paragraphs
        if len(p.get_text(strip=True)) > 40
    )
    title = soup.title.string.strip() if soup.title else ""
    return {"title": title, "content": content}


def clean_text(text: str) -> str:
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def is_article_url(url: str, domain: str) -> bool:
    """Deteksi apakah URL kemungkinan merupakan halaman artikel."""
    pattern = ARTICLE_URL_PATTERNS.get(domain)
    if pattern:
        return bool(re.search(pattern, url))
    # Heuristik umum: URL panjang, bukan halaman statis / aset
    path = urlparse(url).path
    if re.search(r"\.(jpg|jpeg|png|gif|css|js|pdf|zip)$", path, re.I):
        return False
    # Hitung "kedalaman" path — artikel biasanya ≥ 2 segmen
    segments = [s for s in path.split("/") if s]
    return len(segments) >= 2 and len(path) > 20


# ───────────────────────────────────────────────────────────────
#  CRAWL LISTING → KUMPULKAN URL ARTIKEL
# ───────────────────────────────────────────────────────────────

def crawl_listing(listing_url: str, jumlah: int) -> list:
    """
    Ambil halaman listing/homepage, ekstrak link artikel.
    Kembalikan list URL artikel (maksimal `jumlah`).
    """
    domain = get_domain(listing_url)
    rules  = PORTAL_RULES.get(domain, {})

    print(f"  🔍 Crawl listing: {listing_url}")
    html = fetch_html(listing_url)
    if not html:
        return []

    soup  = BeautifulSoup(html, "lxml")
    links = []
    seen  = set()

    # ── Coba selector khusus portal dulu ──
    listing_selectors = rules.get("listing", [])
    if listing_selectors:
        for sel in listing_selectors:
            for a in soup.select(sel):
                href = a.get("href", "")
                if href:
                    full = urljoin(listing_url, href)
                    if full not in seen and is_article_url(full, domain):
                        seen.add(full)
                        links.append(full)

    # ── Fallback: scan semua <a> di halaman ──
    if len(links) < jumlah:
        for a in soup.find_all("a", href=True):
            full = urljoin(listing_url, a["href"])
            parsed = urlparse(full)
            # harus domain yang sama atau subdomain-nya
            if domain not in parsed.netloc:
                continue
            if full not in seen and is_article_url(full, domain):
                seen.add(full)
                links.append(full)

    # Ambil sejumlah yang diminta
    result = links[:jumlah]
    print(f"  📋 Ditemukan {len(links)} link artikel, mengambil {len(result)}")
    return result


# ───────────────────────────────────────────────────────────────
#  SCRAPE SATU ARTIKEL
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

    soup  = BeautifulSoup(html, "lxml")
    rules = PORTAL_RULES.get(result["domain"], {})

    # ── Judul ──
    if rules.get("title"):
        result["title"] = try_selectors(soup, rules["title"])
    if not result["title"]:
        meta_og = soup.find("meta", property="og:title")
        if meta_og and meta_og.get("content"):
            result["title"] = meta_og["content"].strip()
        elif soup.find("h1"):
            result["title"] = soup.find("h1").get_text(strip=True)

    # ── Penulis ──
    if rules.get("author"):
        result["author"] = try_selectors(soup, rules["author"])
    if not result["author"]:
        for attr, val in [("name", "author"), ("property", "article:author")]:
            meta = soup.find("meta", {attr: val})
            if meta and meta.get("content"):
                result["author"] = meta["content"].strip()
                break

    # ── Tanggal ──
    if rules.get("date"):
        result["date"] = try_selectors(soup, rules["date"])
    if not result["date"]:
        for attr, val in [
            ("property", "article:published_time"),
            ("name",     "publishdate"),
            ("itemprop", "datePublished"),
        ]:
            meta = soup.find("meta", {attr: val})
            if meta and meta.get("content"):
                result["date"] = meta["content"][:19].replace("T", " ")
                break
    if not result["date"]:
        time_tag = soup.find("time")
        if time_tag:
            result["date"] = time_tag.get("datetime", "") or time_tag.get_text(strip=True)

    # ── Kategori ──
    if rules.get("category"):
        result["category"] = try_selectors(soup, rules["category"])
    if not result["category"]:
        meta_sec = soup.find("meta", property="article:section")
        if meta_sec and meta_sec.get("content"):
            result["category"] = meta_sec["content"].strip()

    # ── Konten ──
    if rules.get("content"):
        result["content"] = extract_content_text(soup, rules["content"])
    if len(result["content"]) < 300:
        fb = fallback_extract(html)
        if len(fb["content"]) > len(result["content"]):
            result["content"] = fb["content"]
            if not result["title"] and fb["title"]:
                result["title"] = fb["title"]

    result["content"]    = clean_text(result["content"])
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
    # wrap judul panjang
    judul = art["title"] or "(tidak ditemukan)"
    for line in textwrap.wrap(judul, WIDTH - 4):
        print(f"    {line}")

    print()
    divider()
    meta = []
    if art["author"]:   meta.append(f"✍  Penulis  : {art['author']}")
    if art["date"]:     meta.append(f"🗓  Tanggal  : {art['date']}")
    if art["category"]: meta.append(f"🏷  Kategori : {art['category']}")
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
    # python main.py https://url.com 15
    sumber  = sys.argv[1] if len(sys.argv) > 1 else SUMBER_BERITA
    jumlah  = int(sys.argv[2]) if len(sys.argv) > 2 else JUMLAH_BERITA

    print()
    print("╔" + "═" * (WIDTH - 2) + "╗")
    print("║" + "  NEWS SCRAPER — Portal Berita Indonesia".center(WIDTH - 2) + "║")
    print("╚" + "═" * (WIDTH - 2) + "╝")
    print(f"\n  Sumber  : {sumber}")
    print(f"  Target  : {jumlah} artikel")
    print()

    # ── Tahap 1: crawl listing ──
    article_urls = crawl_listing(sumber, jumlah)

    if not article_urls:
        print("\n  ❌  Tidak ada link artikel yang ditemukan.")
        print("     Coba ganti SUMBER_BERITA ke URL kategori/tag yang lebih spesifik.")
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
