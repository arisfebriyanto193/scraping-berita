"""
FastAPI Application Entry Point
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import create_tables, check_database_connection
from app.routes import router as api_router
from app.services.embedder import embedder_service
from app.services.search import search_service
from app.utils.scheduler import scheduler_service
from app.schemas.news import HealthResponse

# Konfigurasi logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager untuk FastAPI (dieksekusi saat startup dan shutdown)
    """
    logger.info("🚀 Memulai aplikasi News Semantic Search...")
    
    # 1. Cek koneksi Database & Buat tabel jika belum ada
    if not check_database_connection():
        logger.warning("⚠️ Gagal terhubung ke MySQL. Beberapa fitur mungkin tidak berfungsi.")
    else:
        create_tables()
        
    # 2. Load Embedding Model
    # Membutuhkan waktu beberapa detik saat pertama kali download model
    try:
        embedder_service.load_model()
    except Exception as e:
        logger.error(f"❌ Gagal load embedding model: {e}")
        
    # 3. Load FAISS Index
    try:
        search_service.load_index()
    except Exception as e:
        logger.error(f"❌ Gagal load FAISS index: {e}")
        
    # 4. Start Background Scheduler (Scraping)
    try:
        scheduler_service.start()
    except Exception as e:
        logger.error(f"❌ Gagal memulai scheduler: {e}")
        
    yield  # -------------------- APLIKASI BERJALAN DI SINI -------------------- #
    
    logger.info("🛑 Mematikan aplikasi...")
    
    # 5. Shutdown cleanup
    try:
        scheduler_service.shutdown()
        search_service.save_index()
    except Exception as e:
        logger.error(f"❌ Error saat shutdown cleanup: {e}")


# =========================================================
# INISIALISASI FASTAPI
# =========================================================
app = FastAPI(
    title="News Semantic Search API",
    description="API untuk Scraping dan Pencarian Berita Berbasis Semantik",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",      # Swagger UI
    redoc_url="/redoc"     # ReDoc UI
)

# =========================================================
# MIDDLEWARE
# =========================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS_LIST,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# GLOBAL EXCEPTION HANDLERS
# =========================================================
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception on {request.url}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": "Internal Server Error", "detail": str(exc)},
    )


# =========================================================
# REGISTER ROUTES
# =========================================================
app.include_router(api_router)


# =========================================================
# HEALTH CHECK
# =========================================================
@app.get("/", tags=["Root"])
def root():
    return {
        "name": "News Semantic Search API",
        "version": "1.0.0",
        "docs_url": "/docs"
    }


@app.get("/health", response_model=HealthResponse, tags=["System"])
def health_check():
    """Endpoint untuk mengecek kesehatan sistem"""
    from app.database import engine, get_db_context
    from app.models.news import News
    
    db_status = "ok" if check_database_connection() else "error"
    
    faiss_status = "ok" if search_service.is_loaded else "not_loaded"
    total_articles = 0
    
    try:
        with get_db_context() as db:
            total_articles = db.query(News).count()
    except:
        db_status = "error"
        
    return HealthResponse(
        status="ok" if db_status == "ok" and faiss_status == "ok" else "degraded",
        database=db_status,
        faiss_index=faiss_status,
        embedding_model=embedder_service.model_name,
        total_articles=total_articles
    )


if __name__ == "__main__":
    import uvicorn
    # Menjalankan server lokal (hanya digunakan jika file ini di-run langsung)
    uvicorn.run("app.main:app", host=settings.API_HOST, port=settings.API_PORT, reload=True)
