"""
Konfigurasi aplikasi - memuat environment variables menggunakan pydantic-settings
"""
import os
from typing import List, Optional
from pydantic_settings import BaseSettings
from pydantic import field_validator
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    """Konfigurasi aplikasi dari environment variables"""
    
    # =========================================================
    # DATABASE
    # =========================================================
    MYSQL_HOST: str = "localhost"
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = "root"
    MYSQL_PASSWORD: str = "password"
    MYSQL_DATABASE: str = "news_semantic_db"
    
    @property
    def DATABASE_URL(self) -> str:
        from urllib.parse import quote_plus
        password = quote_plus(self.MYSQL_PASSWORD) if self.MYSQL_PASSWORD else ""
        return (
            f"mysql+pymysql://{self.MYSQL_USER}:{password}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"
            f"?charset=utf8mb4"
        )
    
    # =========================================================
    # API SERVER
    # =========================================================
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DEBUG: bool = True
    SECRET_KEY: str = "change-this-in-production"
    
    # =========================================================
    # CORS
    # =========================================================
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001,http://localhost:5173"
    
    @property
    def CORS_ORIGINS_LIST(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    
    # =========================================================
    # SCRAPING
    # =========================================================
    USER_AGENTS: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    
    @property
    def USER_AGENTS_LIST(self) -> List[str]:
        return [ua.strip() for ua in self.USER_AGENTS.split("|||")]
    
    SCRAPING_DELAY_MIN: float = 1.0
    SCRAPING_DELAY_MAX: float = 3.0
    MAX_ARTICLES_PER_SOURCE: int = 50
    SCRAPING_TIMEOUT: int = 30
    MAX_RETRIES: int = 3
    
    # =========================================================
    # PLATFORM BASE URLs
    # =========================================================
    DETIK_BASE_URL: str = "https://www.detik.com"
    KOMPAS_BASE_URL: str = "https://www.kompas.com"
    CNN_BASE_URL: str = "https://www.cnnindonesia.com"
    TEMPO_BASE_URL: str = "https://www.tempo.co"
    LIPUTAN6_BASE_URL: str = "https://www.liputan6.com"
    TRIBUN_BASE_URL: str = "https://www.tribunnews.com"
    ANTARA_BASE_URL: str = "https://www.antaranews.com"
    SINDONEWS_BASE_URL: str = "https://www.sindonews.com"
    REPUBLIKA_BASE_URL: str = "https://www.republika.co.id"
    JPNN_BASE_URL: str = "https://www.jpnn.com"
    
    # =========================================================
    # EMBEDDINGS & FAISS
    # =========================================================
    EMBEDDING_MODEL: str = "paraphrase-multilingual-MiniLM-L12-v2"
    EMBEDDING_DIMENSION: int = 384
    FAISS_INDEX_PATH: str = "./data/faiss_index.bin"
    FAISS_IDS_PATH: str = "./data/faiss_ids.pkl"
    BATCH_SIZE: int = 32
    
    # =========================================================
    # SCHEDULER
    # =========================================================
    AUTO_SCRAPE_ENABLED: bool = True
    SCRAPE_INTERVAL_HOURS: int = 6
    CLEANUP_OLD_ARTICLES_DAYS: int = 180
    
    # =========================================================
    # SEARCH CONFIG
    # =========================================================
    DEFAULT_TOP_K: int = 20
    DEFAULT_SIMILARITY_THRESHOLD: float = 0.65
    MAX_SEARCH_RESULTS: int = 100
    
    # Mapping nama platform ke scraper key
    PLATFORM_SOURCES: List[str] = [
        "detik", "kompas", "cnn", "tempo",
        "liputan6", "tribun", "antara", "sindonews",
        "republika", "jpnn"
    ]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


# Singleton instance
settings = Settings()
