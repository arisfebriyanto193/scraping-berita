"""
Scraper Orchestration Service
Mengkoordinasikan scraping dari 10 platform, deduplication, dan penyimpanan ke DB.
"""
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db_context
from app.models.news import News, ScrapingLog
from app.scrapers import SCRAPER_REGISTRY
from app.scrapers.base import ArticleData

logger = logging.getLogger(__name__)


class ScraperService:
    """
    Service utama untuk orchestrate scraping dari semua platform.
    
    Fitur:
    - Parallel scraping menggunakan ThreadPoolExecutor
    - Duplicate detection via URL check di database
    - Error isolation: jika 1 platform gagal, platform lain tetap jalan
    - Logging per platform
    - Trigger FAISS index rebuild setelah scraping selesai
    """

    def __init__(self):
        self.logger = logging.getLogger("service.scraper")

    def scrape_sources(
        self,
        sources: List[str],
        max_articles: int = 20,
    ) -> Dict[str, dict]:
        """
        Scrape dari beberapa platform secara parallel.

        Args:
            sources: List nama platform ["detik", "kompas", ...] atau ["all"]
            max_articles: Maks artikel per platform

        Returns:
            Dict hasil scraping per platform:
            {
                "detik": {"scraped": 18, "failed": 2, "article_ids": [...]},
                ...
            }
        """
        # Resolve "all" ke semua platform
        if "all" in sources or not sources:
            resolved_sources = list(SCRAPER_REGISTRY.keys())
        else:
            resolved_sources = [s.lower() for s in sources if s.lower() in SCRAPER_REGISTRY]

        if not resolved_sources:
            self.logger.warning(f"Tidak ada platform valid dari: {sources}")
            return {}

        self.logger.info(
            f"🚀 Memulai scraping {len(resolved_sources)} platform: {resolved_sources}"
        )

        results = {}

        # Jalankan scraping parallel dengan ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=min(len(resolved_sources), 5)) as executor:
            future_to_source = {
                executor.submit(self._scrape_single_source, source, max_articles): source
                for source in resolved_sources
            }

            for future in as_completed(future_to_source):
                source = future_to_source[future]
                try:
                    result = future.result(timeout=300)  # Max 5 menit per platform
                    results[source] = result
                    self.logger.info(
                        f"✅ {source}: scraped={result['scraped']}, failed={result['failed']}"
                    )
                except Exception as e:
                    self.logger.error(f"❌ Platform {source} error: {e}")
                    results[source] = {
                        "scraped": 0,
                        "failed": 0,
                        "article_ids": [],
                        "error": str(e),
                    }

        # Trigger rebuild FAISS index jika ada artikel baru
        total_new = sum(r.get("scraped", 0) for r in results.values())
        if total_new > 0:
            self.logger.info(
                f"🔄 {total_new} artikel baru. Trigger rebuild FAISS index..."
            )
            try:
                from app.services.search import search_service
                search_service.rebuild_index()
            except Exception as e:
                self.logger.error(f"Gagal rebuild FAISS index: {e}")

        return results

    def _scrape_single_source(self, source: str, max_articles: int) -> dict:
        """
        Scrape satu platform dan simpan hasilnya ke database.

        Returns:
            {"scraped": int, "failed": int, "article_ids": List[int]}
        """
        scraper_class = SCRAPER_REGISTRY.get(source)
        if not scraper_class:
            raise ValueError(f"Scraper tidak ditemukan untuk: {source}")

        scraper = scraper_class()
        scraped_count = 0
        failed_count = 0
        article_ids = []

        # Catat log awal
        log_id = self._create_scraping_log(source)

        try:
            self.logger.info(f"⏳ Scraping {source}...")
            articles = scraper.scrape_latest(max_articles=max_articles)
            self.logger.info(f"   {source}: dapat {len(articles)} artikel raw")

            for article in articles:
                if not article.is_valid():
                    failed_count += 1
                    continue

                try:
                    article_id = self._save_article(article)
                    if article_id:
                        article_ids.append(article_id)
                        scraped_count += 1
                    else:
                        # URL sudah ada di DB (duplikat)
                        pass
                except Exception as e:
                    self.logger.warning(f"Gagal simpan artikel {article.url[:60]}: {e}")
                    failed_count += 1

        except Exception as e:
            self.logger.error(f"Error scraping {source}: {e}")
            failed_count += max_articles
            self._update_scraping_log(log_id, 0, failed_count, "failed", str(e))
            raise

        # Update log selesai
        status = "success" if failed_count == 0 else "partial"
        self._update_scraping_log(log_id, scraped_count, failed_count, status)

        return {
            "scraped": scraped_count,
            "failed": failed_count,
            "article_ids": article_ids,
        }

    def scrape_single_url(self, url: str) -> Optional[int]:
        """
        Scrape satu URL artikel spesifik.

        Args:
            url: URL artikel yang akan di-scrape

        Returns:
            ID artikel jika berhasil, None jika gagal
        """
        # Deteksi platform dari URL
        source = self._detect_source_from_url(url)
        if not source:
            self.logger.warning(f"Platform tidak dikenali untuk URL: {url}")
            return None

        scraper_class = SCRAPER_REGISTRY.get(source)
        if not scraper_class:
            return None

        scraper = scraper_class()
        article = scraper.parse_article(url)

        if not article or not article.is_valid():
            self.logger.warning(f"Gagal parse artikel: {url}")
            return None

        article_id = self._save_article(article)
        if article_id:
            # Rebuild FAISS untuk artikel baru
            try:
                from app.services.search import search_service
                search_service.add_to_index(article_id, article.title, article.content)
            except Exception as e:
                self.logger.warning(f"Gagal tambah ke FAISS index: {e}")

        return article_id

    def _save_article(self, article: ArticleData) -> Optional[int]:
        """
        Simpan artikel ke database. Skip jika URL sudah ada (duplikat).

        Returns:
            ID artikel jika baru disimpan, None jika duplikat
        """
        with get_db_context() as db:
            # Cek duplikat
            existing = db.query(News).filter(News.url == article.url).first()
            if existing:
                return None  # Duplikat, skip

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
            db.flush()  # Dapatkan ID sebelum commit
            article_id = news.id
            return article_id

    def _detect_source_from_url(self, url: str) -> Optional[str]:
        """Deteksi nama platform dari URL"""
        url_lower = url.lower()
        domain_map = {
            "detik.com": "detik",
            "kompas.com": "kompas",
            "cnnindonesia.com": "cnn",
            "tempo.co": "tempo",
            "liputan6.com": "liputan6",
            "tribunnews.com": "tribun",
            "antaranews.com": "antara",
            "sindonews.com": "sindonews",
            "republika.co.id": "republika",
            "jpnn.com": "jpnn",
        }
        for domain, source in domain_map.items():
            if domain in url_lower:
                return source
        return None

    def _create_scraping_log(self, source: str) -> Optional[int]:
        """Buat entri log scraping di database"""
        try:
            with get_db_context() as db:
                log = ScrapingLog(source=source, status="running")
                db.add(log)
                db.flush()
                return log.id
        except Exception as e:
            self.logger.warning(f"Gagal buat scraping log: {e}")
            return None

    def _update_scraping_log(
        self,
        log_id: Optional[int],
        scraped: int,
        failed: int,
        status: str,
        error_msg: str = None,
    ):
        """Update log scraping setelah selesai"""
        if not log_id:
            return
        try:
            with get_db_context() as db:
                log = db.query(ScrapingLog).filter(ScrapingLog.id == log_id).first()
                if log:
                    log.finished_at = datetime.utcnow()
                    log.articles_scraped = scraped
                    log.articles_failed = failed
                    log.status = status
                    if error_msg:
                        log.error_message = error_msg[:1000]
        except Exception as e:
            self.logger.warning(f"Gagal update scraping log: {e}")

    def get_scraping_status(self) -> dict:
        """Dapatkan status scraping terkini"""
        with get_db_context() as db:
            total = db.query(News).count()

            # Count per source
            from sqlalchemy import func
            source_counts = (
                db.query(News.source, func.count(News.id))
                .group_by(News.source)
                .all()
            )

            # Last scraped
            last = db.query(func.max(News.scraped_at)).scalar()

            from app.services.search import search_service
            faiss_size = search_service.get_index_size()

            return {
                "total_articles": total,
                "last_scraped": last,
                "by_source": {src: cnt for src, cnt in source_counts},
                "faiss_index_size": faiss_size,
            }


# Singleton instance
scraper_service = ScraperService()
