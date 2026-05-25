"""
Routes untuk trigger dan memantau scraping
"""
import time
from datetime import datetime, timedelta
from typing import Dict, Any

from fastapi import APIRouter, HTTPException, BackgroundTasks

from app.schemas.news import (
    ManualScrapeRequest, ManualScrapeResponse,
    SingleUrlScrapeRequest, SingleUrlScrapeResponse,
    ScrapeStatusResponse, ScheduleScrapeRequest,
    ScheduleScrapeResponse
)
from app.services.scraper import scraper_service

router = APIRouter()


@router.post("/manual", response_model=ManualScrapeResponse)
def trigger_manual_scrape(request: ManualScrapeRequest, background_tasks: BackgroundTasks):
    """
    Trigger scraping manual untuk platform tertentu.
    Jika ada banyak platform, bisa memakan waktu lama, pertimbangkan gunakan background task
    pada implementasi nyatanya. Untuk API ini akan dieksekusi synchronous (berjalan parallel per platform).
    """
    start_time = time.time()
    try:
        results = scraper_service.scrape_sources(
            sources=request.sources,
            max_articles=request.max_articles
        )
        
        total_scraped = sum(r.get("scraped", 0) for r in results.values())
        total_failed = sum(r.get("failed", 0) for r in results.values())
        duration = time.time() - start_time
        
        return ManualScrapeResponse(
            success=True,
            results=results,
            total_scraped=total_scraped,
            total_failed=total_failed,
            duration_seconds=round(duration, 2)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/single-url", response_model=SingleUrlScrapeResponse)
def scrape_single_url(request: SingleUrlScrapeRequest):
    """
    Scrape hanya satu URL artikel.
    """
    try:
        article_id = scraper_service.scrape_single_url(request.url)
        
        if article_id:
            return SingleUrlScrapeResponse(
                success=True,
                article_id=article_id,
                message="Artikel berhasil discrape dan disimpan"
            )
        else:
            return SingleUrlScrapeResponse(
                success=False,
                message="Gagal scrape artikel atau artikel sudah ada (duplikat)"
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status", response_model=ScrapeStatusResponse)
def get_scraping_status():
    """
    Dapatkan status jumlah artikel di database dan kapan terakhir discrape.
    """
    try:
        return scraper_service.get_scraping_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schedule", response_model=ScheduleScrapeResponse)
def configure_schedule(request: ScheduleScrapeRequest):
    """
    Ubah jadwal auto-scraping via APScheduler.
    """
    from app.utils.scheduler import scheduler_service
    
    try:
        scheduler_service.reschedule_scraping(
            interval_hours=request.interval_hours,
            sources=request.sources,
            max_per_source=request.max_per_source
        )
        
        next_run = datetime.now() + timedelta(hours=request.interval_hours)
        
        return ScheduleScrapeResponse(
            scheduled=True,
            interval_hours=request.interval_hours,
            next_run=next_run,
            message=f"Jadwal scraping diupdate ke setiap {request.interval_hours} jam"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
