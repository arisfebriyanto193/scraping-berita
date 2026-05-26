"""
Pydantic schemas untuk request/response validation API
"""
from datetime import datetime, date
from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field, field_validator, model_validator
from enum import Enum


# =========================================================
# ENUMS
# =========================================================
class SortBy(str, Enum):
    published_date = "published_date"
    scraped_at = "scraped_at"
    relevance = "relevance"


class SortOrder(str, Enum):
    asc = "asc"
    desc = "desc"


class MatchType(str, Enum):
    all = "all"   # AND logic
    any = "any"   # OR logic


class DatePreset(str, Enum):
    today = "today"
    yesterday = "yesterday"
    last_7_days = "last_7_days"
    last_30_days = "last_30_days"
    this_month = "this_month"
    last_month = "last_month"
    this_year = "this_year"


# =========================================================
# BASE ARTICLE SCHEMA
# =========================================================
class ArticleBase(BaseModel):
    title: str
    content: str
    url: str
    source: str
    published_date: Optional[datetime] = None
    category: Optional[str] = None
    author: Optional[str] = None
    image_url: Optional[str] = None


class ArticleResponse(ArticleBase):
    """Response schema untuk artikel berita"""
    id: int
    scraped_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ArticleDetailResponse(ArticleResponse):
    """Response schema detail artikel (konten penuh)"""
    pass


class ArticleListResponse(BaseModel):
    """Response schema untuk list artikel"""
    results: List[ArticleResponse]
    total: int
    page: int
    total_pages: int
    query_time: float


# =========================================================
# SEARCH FILTER SCHEMA (dipakai bersama di semua search)
# =========================================================
class SearchFilters(BaseModel):
    """Filter yang bisa diterapkan pada pencarian"""
    sources: Optional[List[str]] = Field(
        default=None,
        description="Daftar platform sumber (detik, kompas, cnn, dll)"
    )
    categories: Optional[List[str]] = Field(
        default=None,
        description="Daftar kategori berita"
    )
    date_from: Optional[str] = Field(
        default=None,
        description="Tanggal mulai format YYYY-MM-DD"
    )
    date_to: Optional[str] = Field(
        default=None,
        description="Tanggal akhir format YYYY-MM-DD"
    )
    date_preset: Optional[DatePreset] = Field(
        default=None,
        description="Preset periode waktu"
    )
    keywords: Optional[List[str]] = Field(
        default=None,
        description="Keyword tambahan untuk filter"
    )
    has_image: Optional[bool] = Field(
        default=None,
        description="Filter berita yang memiliki gambar"
    )
    author: Optional[str] = Field(
        default=None,
        description="Filter berdasarkan penulis"
    )

    @field_validator("sources", mode="before")
    @classmethod
    def normalize_sources(cls, v):
        if v is None:
            return None
        # Normalize ke lowercase, hapus "all" jika ada sumber lain
        normalized = [s.lower().strip() for s in v]
        if "all" in normalized:
            return None  # None = semua sumber
        return normalized

    @field_validator("categories", mode="before")
    @classmethod
    def normalize_categories(cls, v):
        if v is None:
            return None
        return [c.lower().strip() for c in v]


# =========================================================
# SEMANTIC SEARCH
# =========================================================
class SemanticSearchRequest(BaseModel):
    """Request untuk semantic search"""
    query: str = Field(..., min_length=1, max_length=500, description="Query pencarian")
    top_k: int = Field(default=10, ge=1, le=100, description="Jumlah hasil dikembalikan")
    threshold: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Batas minimum similarity score (0.0 = tampilkan semua, diurutkan dari yang mendekati 0)"
    )
    filters: Optional[SearchFilters] = None

    class Config:
        json_schema_extra = {
            "example": {
                "query": "kebakaran hutan di Kalimantan",
                "top_k": 10,
                "threshold": 0.0,
                "filters": {
                    "sources": ["detik", "kompas"],
                    "categories": ["lingkungan"],
                    "date_from": "2024-01-01",
                    "date_to": "2024-01-31"
                }
            }
        }


class SemanticSearchResult(ArticleResponse):
    """Hasil pencarian semantik dengan similarity score"""
    similarity_score: float = Field(description="Skor kemiripan (mendekati 0 = lebih relevan)")
    distance: float = Field(description="Jarak L2 dari FAISS (0 = identik)")


class SemanticSearchResponse(BaseModel):
    """Response untuk semantic search"""
    results: List[SemanticSearchResult]
    total: int
    query_time: float
    filters_applied: Dict[str, Any] = {}


# =========================================================
# KEYWORD SEARCH
# =========================================================
class KeywordSearchRequest(BaseModel):
    """Request untuk keyword search"""
    keywords: List[str] = Field(..., min_length=1, description="Daftar keyword pencarian")
    match_type: MatchType = Field(default=MatchType.all, description="AND atau OR logic")
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)
    filters: Optional[SearchFilters] = None
    sort_by: SortBy = Field(default=SortBy.published_date)
    sort_order: SortOrder = Field(default=SortOrder.desc)

    class Config:
        json_schema_extra = {
            "example": {
                "keywords": ["kebakaran", "hutan"],
                "match_type": "all",
                "page": 1,
                "limit": 20,
                "filters": {
                    "sources": ["detik", "kompas"],
                    "date_from": "2024-01-01",
                    "date_to": "2024-01-31"
                },
                "sort_by": "published_date",
                "sort_order": "desc"
            }
        }


class KeywordSearchResponse(BaseModel):
    """Response untuk keyword search"""
    results: List[ArticleResponse]
    total: int
    page: int
    total_pages: int
    query_time: float


# =========================================================
# HYBRID SEARCH
# =========================================================
class HybridSearchRequest(BaseModel):
    """Request untuk hybrid search (semantic + keyword)"""
    query: str = Field(..., min_length=1, max_length=500)
    keywords: Optional[List[str]] = Field(default=None)
    semantic_weight: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Bobot semantic search (0.7 = 70% semantic, 30% keyword)"
    )
    top_k: int = Field(default=10, ge=1, le=100)
    filters: Optional[SearchFilters] = None

    class Config:
        json_schema_extra = {
            "example": {
                "query": "kebakaran hutan",
                "keywords": ["Kalimantan", "2024"],
                "semantic_weight": 0.7,
                "top_k": 10,
                "filters": {
                    "sources": ["detik", "kompas"],
                    "date_from": "2024-01-01",
                    "date_to": "2024-01-31"
                }
            }
        }


class HybridSearchResult(ArticleResponse):
    """Hasil hybrid search dengan combined score"""
    similarity_score: float
    distance: float
    keyword_score: float = 0.0
    combined_score: float


class HybridSearchResponse(BaseModel):
    """Response hybrid search"""
    results: List[HybridSearchResult]
    total: int
    query_time: float
    semantic_weight: float
    keyword_weight: float


# =========================================================
# ADVANCED FILTER SEARCH
# =========================================================
class FilterSearchRequest(BaseModel):
    """Request untuk advanced filter search"""
    sources: Optional[List[str]] = None
    categories: Optional[List[str]] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    date_preset: Optional[DatePreset] = None
    has_image: Optional[bool] = None
    author: Optional[str] = None
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)
    sort_by: SortBy = Field(default=SortBy.published_date)
    sort_order: SortOrder = Field(default=SortOrder.desc)


class FilterSearchResponse(BaseModel):
    """Response filter search"""
    results: List[ArticleResponse]
    total: int
    page: int
    total_pages: int
    query_time: float


# =========================================================
# SCRAPING SCHEMAS
# =========================================================
class ManualScrapeRequest(BaseModel):
    """Request untuk manual scraping"""
    sources: List[str] = Field(
        default=["all"],
        description="Daftar platform yang akan di-scrape. ['all'] untuk semua."
    )
    max_articles: int = Field(default=20, ge=1, le=200)

    class Config:
        json_schema_extra = {
            "example": {
                "sources": ["detik", "kompas"],
                "max_articles": 20
            }
        }


class SingleUrlScrapeRequest(BaseModel):
    """Request untuk scrape satu URL"""
    url: str = Field(..., description="URL artikel yang akan di-scrape")


class ScheduleScrapeRequest(BaseModel):
    """Request untuk setting jadwal scraping"""
    interval_hours: int = Field(default=6, ge=1, le=168)
    sources: List[str] = Field(default=["all"])
    max_per_source: int = Field(default=50, ge=1, le=200)


class ScrapeSourceResult(BaseModel):
    scraped: int
    failed: int
    articles_ids: Optional[List[int]] = None


class ManualScrapeResponse(BaseModel):
    success: bool
    results: Dict[str, ScrapeSourceResult]
    total_scraped: int
    total_failed: int
    duration_seconds: float


class SingleUrlScrapeResponse(BaseModel):
    success: bool
    article_id: Optional[int] = None
    message: str


class ScrapeStatusResponse(BaseModel):
    total_articles: int
    last_scraped: Optional[datetime]
    by_source: Dict[str, int]
    faiss_index_size: int


class ScheduleScrapeResponse(BaseModel):
    scheduled: bool
    interval_hours: int
    next_run: Optional[datetime]
    message: str


# =========================================================
# NEWS MANAGEMENT SCHEMAS
# =========================================================
class NewsStatsResponse(BaseModel):
    """Statistik artikel per platform, kategori, bulan"""
    total_articles: int
    by_source: Dict[str, int]
    by_category: Dict[str, int]
    by_month: Dict[str, int]
    faiss_index_size: int


class SourceInfo(BaseModel):
    source: str
    count: int
    last_scraped: Optional[datetime]


class CategoryInfo(BaseModel):
    category: str
    count: int


# =========================================================
# ANALYTICS SCHEMAS
# =========================================================
class TrendingTopicItem(BaseModel):
    keyword: str
    count: int
    sources: List[str]


class TrendingResponse(BaseModel):
    trending: List[TrendingTopicItem]
    days: int
    generated_at: datetime


class SourceComparisonItem(BaseModel):
    source: str
    total_articles: int
    categories: Dict[str, int]
    daily_average: float


class SourceComparisonResponse(BaseModel):
    comparison: List[SourceComparisonItem]
    date_from: str
    date_to: str


# =========================================================
# GENERIC RESPONSE
# =========================================================
class SuccessResponse(BaseModel):
    success: bool = True
    message: str


class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    detail: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    database: str
    faiss_index: str
    embedding_model: str
    total_articles: int
    version: str = "1.0.0"
