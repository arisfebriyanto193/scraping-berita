"""Routes package"""
from fastapi import APIRouter

# Buat router utama
router = APIRouter()

from app.routes.scraping import router as scraping_router
from app.routes.search import router as search_router
from app.routes.news import router as news_router

router.include_router(scraping_router, prefix="/api/scrape", tags=["Scraping"])
router.include_router(search_router, prefix="/api/search", tags=["Search"])
router.include_router(news_router, prefix="/api", tags=["News"])
