"""
Routes untuk manajemen artikel berita (CRUD dasar dan Analitik)
"""
import math
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.news import News
from app.schemas.news import (
    ArticleResponse, ArticleDetailResponse, ArticleListResponse,
    NewsStatsResponse, SourceInfo, CategoryInfo,
    TrendingResponse, TrendingTopicItem,
    SourceComparisonResponse, SourceComparisonItem,
    SuccessResponse
)

router = APIRouter()


@router.get("/news", response_model=ArticleListResponse)
def get_news_list(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    source: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Dapatkan list berita dengan filter sederhana.
    """
    query = db.query(News)
    
    if source:
        query = query.filter(News.source == source)
    if category:
        query = query.filter(News.category == category)
        
    if date_from:
        try:
            df = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.filter(News.published_date >= df)
        except:
            pass
            
    if date_to:
        try:
            dt = datetime.strptime(date_to, "%Y-%m-%d")
            dt = dt.replace(hour=23, minute=59, second=59)
            query = query.filter(News.published_date <= dt)
        except:
            pass
            
    total = query.count()
    total_pages = math.ceil(total / limit) if limit > 0 else 0
    
    articles = query.order_by(News.published_date.desc()).offset((page - 1) * limit).limit(limit).all()
    
    return ArticleListResponse(
        results=[a.to_dict() for a in articles],
        total=total,
        page=page,
        total_pages=total_pages,
        query_time=0.0
    )


@router.get("/news/stats", response_model=NewsStatsResponse)
def get_news_stats(db: Session = Depends(get_db)):
    """
    Dapatkan statistik keseluruhan (per platform, per kategori, dll).
    """
    # Total
    total = db.query(News).count()
    
    # By Source
    source_stats = db.query(News.source, func.count(News.id)).group_by(News.source).all()
    by_source = {s[0]: s[1] for s in source_stats}
    
    # By Category
    category_stats = db.query(News.category, func.count(News.id)).group_by(News.category).all()
    by_category = {c[0] or "umum": c[1] for c in category_stats}
    
    # By Month (last 6 months)
    by_month = {}
    try:
        # MySQL specific: DATE_FORMAT
        month_stats = db.query(
            func.date_format(News.published_date, '%Y-%m').label('month'),
            func.count(News.id)
        ).group_by('month').order_by(func.date_format(News.published_date, '%Y-%m').desc()).limit(6).all()
        
        by_month = {m[0] or "unknown": m[1] for m in month_stats}
    except:
        pass
        
    from app.services.search import search_service
    
    return NewsStatsResponse(
        total_articles=total,
        by_source=by_source,
        by_category=by_category,
        by_month=by_month,
        faiss_index_size=search_service.get_index_size()
    )


@router.get("/news/sources", response_model=List[SourceInfo])
def get_sources_list(db: Session = Depends(get_db)):
    """
    Daftar 10 platform berita dan jumlah artikelnya.
    """
    stats = db.query(
        News.source, 
        func.count(News.id).label('count'),
        func.max(News.scraped_at).label('last_scraped')
    ).group_by(News.source).order_by(func.count(News.id).desc()).all()
    
    return [
        SourceInfo(source=s[0], count=s[1], last_scraped=s[2])
        for s in stats
    ]


@router.get("/news/categories", response_model=List[CategoryInfo])
def get_categories_list(db: Session = Depends(get_db)):
    """
    Daftar kategori dan jumlah artikelnya.
    """
    stats = db.query(
        News.category, 
        func.count(News.id).label('count')
    ).filter(News.category.isnot(None)).group_by(News.category).order_by(func.count(News.id).desc()).all()
    
    return [
        CategoryInfo(category=s[0], count=s[1])
        for s in stats if s[0]
    ]


@router.get("/news/{id}", response_model=ArticleDetailResponse)
def get_news_detail(id: int, db: Session = Depends(get_db)):
    """
    Dapatkan detail satu berita.
    """
    article = db.query(News).filter(News.id == id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artikel tidak ditemukan")
    return article.to_dict()


@router.delete("/news/{id}", response_model=SuccessResponse)
def delete_news(id: int, db: Session = Depends(get_db)):
    """
    Hapus satu artikel.
    """
    article = db.query(News).filter(News.id == id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artikel tidak ditemukan")
        
    db.delete(article)
    db.commit()
    
    # Idealnya hapus juga dari FAISS index, tapi FAISS tidak mendukung penghapusan parsial yang mudah.
    # Biasanya kita flag deleted, atau rebuild index saat jadwal harian.
    
    return SuccessResponse(success=True, message=f"Artikel {id} berhasil dihapus")


# =========================================================
# ANALYTICS ENDPOINTS
# =========================================================

@router.get("/analytics/trending", response_model=TrendingResponse)
def get_trending_topics(days: int = 7, limit: int = 10, db: Session = Depends(get_db)):
    """
    Dapatkan topik/keyword yang sedang trending berdasarkan kemunculan di judul
    dalam beberapa hari terakhir.
    """
    date_since = datetime.now() - timedelta(days=days)
    
    # Ambil judul berita terbaru
    titles = db.query(News.title, News.source).filter(News.published_date >= date_since).all()
    
    # Ekstraksi keyword sederhana (implementasi nyata bisa pakai NLP/TF-IDF)
    import re
    from collections import Counter, defaultdict
    
    stop_words = {"di", "ke", "dari", "yang", "dan", "atau", "untuk", "dengan", 
                  "pada", "dalam", "ini", "itu", "juga", "ada", "tidak", "bisa",
                  "akan", "sudah", "telah", "belum", "saat", "setelah", "karena",
                  "sebagai", "oleh", "serta", "hingga", "agar", "lebih", "lalu",
                  "tentang", "tahun", "hari", "orang", "baru"}
                  
    word_counter = Counter()
    word_sources = defaultdict(set)
    
    for title, source in titles:
        # Bersihkan punctuation
        clean_title = re.sub(r'[^\w\s]', ' ', title.lower())
        words = [w for w in clean_title.split() if len(w) > 3 and w not in stop_words]
        
        # Hitung bigram (2 kata) juga agar lebih bermakna (contoh: "pemilu 2024")
        bigrams = [f"{words[i]} {words[i+1]}" for i in range(len(words)-1)]
        
        # Tambahkan ke counter
        for item in words + bigrams:
            word_counter[item] += 1
            word_sources[item].add(source)
            
    # Ambil top N
    top_items = []
    # Filter agar tidak memasukkan kata tunggal jika sudah ada di bigram top
    for item, count in word_counter.most_common(limit * 2):
        if len(top_items) >= limit:
            break
            
        # Skip kata tunggal yang terlalu sering tapi gak bermakna
        if count >= 3: 
            top_items.append(
                TrendingTopicItem(
                    keyword=item,
                    count=count,
                    sources=list(word_sources[item])
                )
            )
            
    return TrendingResponse(
        trending=top_items,
        days=days,
        generated_at=datetime.now()
    )


@router.get("/analytics/source-comparison", response_model=SourceComparisonResponse)
def get_source_comparison(date_from: str, date_to: str, db: Session = Depends(get_db)):
    """
    Bandingkan cakupan berita antar platform dalam rentang waktu tertentu.
    """
    try:
        df = datetime.strptime(date_from, "%Y-%m-%d")
        dt = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    except ValueError:
        raise HTTPException(status_code=400, detail="Format tanggal tidak valid (YYYY-MM-DD)")
        
    days_diff = max(1, (dt - df).days)
    
    # Query gabungan untuk total per source dan per category
    stats = db.query(
        News.source,
        News.category,
        func.count(News.id)
    ).filter(
        and_(News.published_date >= df, News.published_date <= dt)
    ).group_by(News.source, News.category).all()
    
    # Proses hasil query
    source_data = {}
    for source, category, count in stats:
        if source not in source_data:
            source_data[source] = {
                "total": 0,
                "categories": {}
            }
            
        source_data[source]["total"] += count
        cat_name = category or "umum"
        source_data[source]["categories"][cat_name] = count
        
    # Format response
    comparison = []
    for source, data in source_data.items():
        comparison.append(
            SourceComparisonItem(
                source=source,
                total_articles=data["total"],
                categories=data["categories"],
                daily_average=round(data["total"] / days_diff, 2)
            )
        )
        
    # Sort by total articles desc
    comparison.sort(key=lambda x: x.total_articles, reverse=True)
    
    return SourceComparisonResponse(
        comparison=comparison,
        date_from=date_from,
        date_to=date_to
    )
