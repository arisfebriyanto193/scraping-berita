"""
Routes untuk pencarian Semantic, Keyword, dan Hybrid
"""
import math
from fastapi import APIRouter, HTTPException, Depends

from app.schemas.news import (
    SemanticSearchRequest, SemanticSearchResponse,
    KeywordSearchRequest, KeywordSearchResponse,
    HybridSearchRequest, HybridSearchResponse,
    FilterSearchRequest, FilterSearchResponse
)
from app.services.search import search_service

router = APIRouter()


@router.post("/semantic", response_model=SemanticSearchResponse)
def semantic_search(request: SemanticSearchRequest):
    """
    Pencarian Semantik menggunakan FAISS dan model Embedding.
    Mendukung filter SQL setelah kandidat FAISS didapatkan.
    """
    try:
        results, total, query_time, filters_applied = search_service.semantic_search(
            query_text=request.query,
            top_k=request.top_k,
            threshold=request.threshold,
            filters=request.filters
        )
        
        return SemanticSearchResponse(
            results=results,
            total=total,
            query_time=round(query_time, 4),
            filters_applied=filters_applied
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/keyword", response_model=KeywordSearchResponse)
def keyword_search(request: KeywordSearchRequest):
    """
    Pencarian Tradisional menggunakan Keyword matching (LIKE/FULLTEXT).
    """
    try:
        results, total, query_time = search_service.keyword_search(
            keywords=request.keywords,
            match_type=request.match_type,
            page=request.page,
            limit=request.limit,
            filters=request.filters,
            sort_by=request.sort_by,
            sort_order=request.sort_order
        )
        
        total_pages = math.ceil(total / request.limit) if request.limit > 0 else 0
        
        return KeywordSearchResponse(
            results=results,
            total=total,
            page=request.page,
            total_pages=total_pages,
            query_time=round(query_time, 4)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/hybrid", response_model=HybridSearchResponse)
def hybrid_search(request: HybridSearchRequest):
    """
    Pencarian Hybrid: Kombinasi Semantic (makna) dan Keyword (teks eksak).
    Sangat berguna untuk mencari topik spesifik dengan keyword wajib.
    """
    try:
        results, total, query_time = search_service.hybrid_search(
            query_text=request.query,
            keywords=request.keywords,
            semantic_weight=request.semantic_weight,
            top_k=request.top_k,
            filters=request.filters
        )
        
        keyword_weight = 1.0 - request.semantic_weight
        
        return HybridSearchResponse(
            results=results,
            total=total,
            query_time=round(query_time, 4),
            semantic_weight=request.semantic_weight,
            keyword_weight=keyword_weight
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/filter", response_model=FilterSearchResponse)
def advanced_filter(request: FilterSearchRequest):
    """
    Advanced Filtering: Mencari artikel hanya menggunakan filter tanpa keyword/semantic.
    Berguna untuk navigasi direktori atau arsip berita.
    """
    try:
        from app.schemas.news import SearchFilters
        
        # Konversi request ke SearchFilters
        filters = SearchFilters(
            sources=request.sources,
            categories=request.categories,
            date_from=request.date_from,
            date_to=request.date_to,
            date_preset=request.date_preset,
            has_image=request.has_image,
            author=request.author
        )
        
        # Panggil keyword_search dengan array keywords kosong
        results, total, query_time = search_service.keyword_search(
            keywords=[], # Tanpa keyword
            page=request.page,
            limit=request.limit,
            filters=filters,
            sort_by=request.sort_by,
            sort_order=request.sort_order
        )
        
        total_pages = math.ceil(total / request.limit) if request.limit > 0 else 0
        
        return FilterSearchResponse(
            results=results,
            total=total,
            page=request.page,
            total_pages=total_pages,
            query_time=round(query_time, 4)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
