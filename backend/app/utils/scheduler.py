"""
Scheduler Service menggunakan APScheduler
Untuk auto-scraping terjadwal dan maintenance rutin (cleanup, re-index).
"""
import logging
from typing import List

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.services.scraper import scraper_service

logger = logging.getLogger(__name__)


class SchedulerService:
    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.logger = logging.getLogger("service.scheduler")
        self._scraping_job_id = "auto_scraping_job"
        self._maintenance_job_id = "maintenance_job"

    def start(self):
        """Mulai scheduler saat aplikasi startup"""
        if not settings.AUTO_SCRAPE_ENABLED:
            self.logger.info("ℹ️ Auto-scraping dinonaktifkan di konfigurasi")
            return

        # 1. Job Auto Scraping
        self.scheduler.add_job(
            self._scheduled_scrape,
            trigger=IntervalTrigger(hours=settings.SCRAPE_INTERVAL_HOURS),
            id=self._scraping_job_id,
            name="Auto Scraping All Sources",
            replace_existing=True
        )

        # 2. Job Maintenance (Cleanup DB & Re-index penuh mingguan)
        # Berjalan setiap minggu sekali
        self.scheduler.add_job(
            self._scheduled_maintenance,
            trigger=IntervalTrigger(weeks=1),
            id=self._maintenance_job_id,
            name="Weekly Maintenance",
            replace_existing=True
        )

        self.scheduler.start()
        self.logger.info(
            f"✅ Scheduler dimulai. Scraping tiap {settings.SCRAPE_INTERVAL_HOURS} jam."
        )

    def shutdown(self):
        """Matikan scheduler saat aplikasi shutdown"""
        if self.scheduler.running:
            self.scheduler.shutdown()
            self.logger.info("🛑 Scheduler dihentikan.")

    def reschedule_scraping(self, interval_hours: int, sources: List[str] = ["all"], max_per_source: int = 50):
        """Update konfigurasi job scraping"""
        if not self.scheduler.running:
            self.scheduler.start()
            
        self.scheduler.add_job(
            self._scheduled_scrape,
            trigger=IntervalTrigger(hours=interval_hours),
            args=[sources, max_per_source],
            id=self._scraping_job_id,
            name=f"Auto Scraping {len(sources)} Sources",
            replace_existing=True
        )
        self.logger.info(f"🔄 Jadwal scraping diupdate ke interval {interval_hours} jam.")

    def _scheduled_scrape(self, sources: List[str] = ["all"], max_per_source: int = settings.MAX_ARTICLES_PER_SOURCE):
        """Task yang dieksekusi oleh scheduler untuk scraping"""
        self.logger.info("⏰ Memulai AUTO-SCRAPING terjadwal...")
        try:
            # Karena ini background task, biarkan service utama (scraper_service) yang handle parallelism
            results = scraper_service.scrape_sources(sources, max_articles=max_per_source)
            total_scraped = sum(r.get("scraped", 0) for r in results.values())
            self.logger.info(f"✅ AUTO-SCRAPING Selesai. {total_scraped} artikel baru didapatkan.")
        except Exception as e:
            self.logger.error(f"❌ AUTO-SCRAPING Error: {e}")

    def _scheduled_maintenance(self):
        """Task pemeliharaan: hapus artikel lama & rebuild index bersih"""
        self.logger.info("⏰ Memulai WEEKLY MAINTENANCE...")
        try:
            # 1. Cleanup database (panggil stored procedure MySQL)
            from app.database import get_db_context
            from sqlalchemy import text
            
            with get_db_context() as db:
                db.execute(
                    text(f"CALL cleanup_old_articles({settings.CLEANUP_OLD_ARTICLES_DAYS})")
                )
                self.logger.info(f"✅ Cleanup artikel > {settings.CLEANUP_OLD_ARTICLES_DAYS} hari selesai.")
                
            # 2. Rebuild FAISS index
            from app.services.search import search_service
            search_service.rebuild_index(background=False)
            self.logger.info("✅ Rebuild FAISS index selesai.")
            
        except Exception as e:
            self.logger.error(f"❌ MAINTENANCE Error: {e}")


# Singleton instance
scheduler_service = SchedulerService()
