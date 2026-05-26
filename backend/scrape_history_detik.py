import os
import sys
import time
import logging
from datetime import datetime, timedelta
from typing import List

# Tambahkan current path ke sys.path agar bisa import module app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import get_db_context
from app.models.news import News
from app.scrapers.detik import DetikScraper
from app.services.search import search_service

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("ScrapeHistory")

def get_detik_links_from_date(scraper: DetikScraper, date_str: str) -> List[str]:
    """
    Ambil link berita detik.com berdasarkan indeks tanggal.
    Format date_str harus MM/DD/YYYY
    """
    url = f"https://news.detik.com/indeks?date={date_str}"
    logger.info(f"Mengambil indeks: {url}")
    
    soup = scraper._fetch(url)
    if not soup:
        return []
        
    # Gunakan selector detik scraper
    return scraper._extract_article_links(soup)


def run_historical_scrape(days_back: int = 120):
    """
    Mundur ke belakang sebanyak `days_back` hari.
    """
    scraper = DetikScraper()
    
    today = datetime.now()
    
    total_saved = 0
    total_duplicates = 0
    
    for i in range(days_back):
        target_date = today - timedelta(days=i)
        date_str = target_date.strftime("%m/%d/%Y") # Format MM/DD/YYYY
        
        logger.info(f"--- [HARI KE-{i+1}/{days_back}] Mengerjakan Tanggal: {target_date.strftime('%Y-%m-%d')} ---")
        
        links = get_detik_links_from_date(scraper, date_str)
        logger.info(f"Ditemukan {len(links)} link artikel dari halaman indeks.")
        
        saved_today = 0
        
        for url in links:
            # 1. Cek duplikat secara cepat sebelum parse
            with get_db_context() as db:
                existing = db.query(News).filter(News.url == url).first()
                if existing:
                    total_duplicates += 1
                    continue
            
            # 2. Parse detail artikel
            article = scraper.parse_article(url)
            if not article or not article.is_valid():
                continue
                
            # 3. Simpan ke database
            try:
                with get_db_context() as db:
                    # Cek lagi siapa tau di-insert parallel
                    if db.query(News).filter(News.url == article.url).first():
                        continue
                        
                    news = News(
                        title=article.title[:500],
                        content=article.content,
                        url=article.url[:1000],
                        source=article.source,
                        published_date=article.published_date,
                        category=article.category[:100] if article.category else None,
                        author=article.author[:200] if article.author else None,
                        image_url=article.image_url[:1000] if article.image_url else None,
                    )
                    db.add(news)
                    db.flush()
                    article_id = news.id
                    
                # 4. Langsung Embed ke FAISS Index (Opsional)
                search_service.add_to_index(article_id, article.title, article.content)
                
                saved_today += 1
                total_saved += 1
                logger.info(f"✅ Disimpan: {article.title[:50]}")
                
            except Exception as e:
                logger.error(f"Gagal menyimpan {url}: {e}")
                
        logger.info(f"Selesai tanggal {target_date.strftime('%Y-%m-%d')}. Disimpan: {saved_today}, Duplikat: {total_duplicates}")
        
        # Beri delay antar hari agar IP aman
        time.sleep(3)
        
    logger.info("=" * 50)
    logger.info("🎉 SCRAPING HISTORIS SELESAI 🎉")
    logger.info(f"Total Hari Diperiksa: {days_back} hari")
    logger.info(f"Total Artikel Baru Disimpan: {total_saved}")
    logger.info("=" * 50)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Scrape sejarah berita Detik")
    parser.add_argument("--days", type=int, default=120, help="Jumlah hari ke belakang")
    args = parser.parse_args()
    
    # Pastikan FAISS dimuat dulu
    if not search_service.is_loaded:
        search_service.load_index()
        
    run_historical_scrape(args.days)
