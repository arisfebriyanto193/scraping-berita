"""
Search Service - Melakukan pencarian Semantic, Keyword, dan Hybrid.
Mengintegrasikan MySQL (metadata & FULLTEXT) dengan FAISS (vector search).
"""
import logging
import os
import pickle
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any

import faiss
import numpy as np
from sqlalchemy import or_, and_, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db_context
from app.models.news import News, SearchLog
from app.schemas.news import SearchFilters, DatePreset, MatchType
from app.services.embedder import embedder_service

logger = logging.getLogger(__name__)


class SearchService:
    """
    Service untuk melakukan pencarian berita (Semantic, Keyword, Hybrid).
    """

    def __init__(self):
        self.index = None
        self.id_map = {}  # Map: urutan FAISS -> ID artikel (int -> int)
        self.reverse_id_map = {} # Map: ID artikel -> urutan FAISS
        self.is_loaded = False
        self.logger = logging.getLogger("service.search")

    def load_index(self):
        """Muat FAISS index dari disk ke memory"""
        try:
            # Pastikan folder data ada
            os.makedirs(os.path.dirname(settings.FAISS_INDEX_PATH), exist_ok=True)

            if os.path.exists(settings.FAISS_INDEX_PATH) and os.path.exists(settings.FAISS_IDS_PATH):
                self.logger.info(f"⏳ Memuat FAISS index dari {settings.FAISS_INDEX_PATH}...")
                self.index = faiss.read_index(settings.FAISS_INDEX_PATH)
                with open(settings.FAISS_IDS_PATH, "rb") as f:
                    self.id_map = pickle.load(f)
                
                # Build reverse map
                self.reverse_id_map = {article_id: faiss_id for faiss_id, article_id in self.id_map.items()}
                
                self.is_loaded = True
                self.logger.info(f"✅ FAISS index dimuat: {self.index.ntotal} artikel")
            else:
                self.logger.info("ℹ️ FAISS index belum ada. Membuat index baru...")
                # L2 normalization (Inner Product setara dengan Cosine Similarity jika vector dinormalisasi)
                self.index = faiss.IndexFlatIP(settings.EMBEDDING_DIMENSION)
                self.id_map = {}
                self.reverse_id_map = {}
                self.is_loaded = True
                
                # Coba populate dari DB jika DB sudah ada isinya
                self.rebuild_index(background=False)
        except Exception as e:
            self.logger.error(f"❌ Gagal memuat FAISS index: {e}")
            # Buat index kosong sebagai fallback
            self.index = faiss.IndexFlatIP(settings.EMBEDDING_DIMENSION)
            self.id_map = {}
            self.reverse_id_map = {}
            self.is_loaded = True

    def save_index(self):
        """Simpan FAISS index ke disk"""
        if not self.is_loaded or self.index is None:
            return
            
        try:
            os.makedirs(os.path.dirname(settings.FAISS_INDEX_PATH), exist_ok=True)
            faiss.write_index(self.index, settings.FAISS_INDEX_PATH)
            with open(settings.FAISS_IDS_PATH, "wb") as f:
                pickle.dump(self.id_map, f)
            self.logger.info(f"✅ FAISS index disimpan ({self.index.ntotal} artikel)")
        except Exception as e:
            self.logger.error(f"❌ Gagal menyimpan FAISS index: {e}")

    def rebuild_index(self, background: bool = True):
        """
        Bangun ulang FAISS index dari semua artikel di database.
        Ini dipanggil secara berkala atau setelah scraping.
        """
        if background:
            import threading
            threading.Thread(target=self._do_rebuild_index).start()
        else:
            self._do_rebuild_index()

    def _do_rebuild_index(self):
        self.logger.info("⏳ Membangun ulang FAISS index...")
        
        # Inisialisasi ulang index
        new_index = faiss.IndexFlatIP(settings.EMBEDDING_DIMENSION)
        new_id_map = {}
        
        with get_db_context() as db:
            # Ambil total artikel
            total = db.query(News).count()
            if total == 0:
                self.logger.info("ℹ️ Tidak ada artikel di database")
                return
                
            self.logger.info(f"⏳ Mengekstrak embedding untuk {total} artikel...")
            
            # Batch processing
            batch_size = 100
            offset = 0
            
            while offset < total:
                articles = db.query(News.id, News.title, News.content).offset(offset).limit(batch_size).all()
                if not articles:
                    break
                    
                titles = [a.title for a in articles]
                contents = [a.content[:500] for a in articles] # ambil 500 karakter pertama content
                
                # Gabungkan title (diperkuat) dan content
                texts_to_embed = [f"{t} {t} {t} {c}" for t, c in zip(titles, contents)]
                
                # Generate embeddings
                embeddings = embedder_service.embed_batch(texts_to_embed)
                
                # Add to FAISS
                start_idx = new_index.ntotal
                new_index.add(embeddings)
                
                # Update map
                for i, article in enumerate(articles):
                    new_id_map[start_idx + i] = article.id
                    
                offset += batch_size
                self.logger.info(f"  Processed {min(offset, total)}/{total} articles")
                
        # Swap index secara atomik (hampir)
        self.index = new_index
        self.id_map = new_id_map
        self.reverse_id_map = {article_id: faiss_id for faiss_id, article_id in self.id_map.items()}
        self.save_index()
        self.logger.info(f"✅ FAISS index berhasil dibangun ulang: {self.index.ntotal} artikel")

    def add_to_index(self, article_id: int, title: str, content: str):
        """Tambah satu artikel ke FAISS index"""
        if not self.is_loaded:
            self.load_index()
            
        if article_id in self.reverse_id_map:
            return # Sudah ada
            
        embedding = embedder_service.embed_article(title, content)
        # Reshape for FAISS
        embedding = np.expand_dims(embedding, axis=0)
        
        idx = self.index.ntotal
        self.index.add(embedding)
        self.id_map[idx] = article_id
        self.reverse_id_map[article_id] = idx
        
        # Save every 10 additions to avoid too much I/O
        if idx % 10 == 0:
            self.save_index()

    def get_index_size(self) -> int:
        if not self.is_loaded:
            return 0
        return self.index.ntotal if self.index else 0

    # =========================================================
    # FILTERING LOGIC
    # =========================================================
    def _apply_filters_to_query(self, query, filters: Optional[SearchFilters]):
        """Menerapkan SQLAlchemy filters ke query database"""
        if not filters:
            return query
            
        # 1. Source filter
        if filters.sources:
            query = query.filter(News.source.in_(filters.sources))
            
        # 2. Category filter
        if filters.categories:
            query = query.filter(News.category.in_(filters.categories))
            
        # 3. Date filter (from & to)
        if filters.date_from:
            try:
                date_from = datetime.strptime(filters.date_from, "%Y-%m-%d")
                query = query.filter(News.published_date >= date_from)
            except ValueError:
                pass
                
        if filters.date_to:
            try:
                date_to = datetime.strptime(filters.date_to, "%Y-%m-%d")
                # Sampai akhir hari tersebut
                date_to = date_to.replace(hour=23, minute=59, second=59)
                query = query.filter(News.published_date <= date_to)
            except ValueError:
                pass
                
        # 4. Date Preset filter
        if filters.date_preset:
            now = datetime.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            
            if filters.date_preset == DatePreset.today:
                query = query.filter(News.published_date >= today_start)
            elif filters.date_preset == DatePreset.yesterday:
                yesterday_start = today_start - timedelta(days=1)
                query = query.filter(and_(
                    News.published_date >= yesterday_start,
                    News.published_date < today_start
                ))
            elif filters.date_preset == DatePreset.last_7_days:
                query = query.filter(News.published_date >= (today_start - timedelta(days=7)))
            elif filters.date_preset == DatePreset.last_30_days:
                query = query.filter(News.published_date >= (today_start - timedelta(days=30)))
            elif filters.date_preset == DatePreset.this_month:
                month_start = today_start.replace(day=1)
                query = query.filter(News.published_date >= month_start)
            elif filters.date_preset == DatePreset.last_month:
                # Tanggal 1 bulan ini
                first_day_this_month = today_start.replace(day=1)
                # Tanggal terakhir bulan lalu
                last_day_last_month = first_day_this_month - timedelta(days=1)
                # Tanggal 1 bulan lalu
                first_day_last_month = last_day_last_month.replace(day=1)
                
                query = query.filter(and_(
                    News.published_date >= first_day_last_month,
                    News.published_date <= last_day_last_month.replace(hour=23, minute=59, second=59)
                ))
            elif filters.date_preset == DatePreset.this_year:
                year_start = today_start.replace(month=1, day=1)
                query = query.filter(News.published_date >= year_start)
                
        # 5. Keywords tambahan
        if filters.keywords:
            for kw in filters.keywords:
                search_term = f"%{kw}%"
                query = query.filter(or_(
                    News.title.ilike(search_term),
                    News.content.ilike(search_term)
                ))
                
        # 6. Has image
        if filters.has_image is not None:
            if filters.has_image:
                query = query.filter(and_(News.image_url.isnot(None), News.image_url != ""))
            else:
                query = query.filter(or_(News.image_url.is_(None), News.image_url == ""))
                
        # 7. Author
        if filters.author:
            query = query.filter(News.author.ilike(f"%{filters.author}%"))
            
        return query

    # =========================================================
    # SEARCH METHODS
    # =========================================================
    def semantic_search(
        self, 
        query_text: str, 
        top_k: int = 20, 
        threshold: float = 0.0,
        filters: Optional[SearchFilters] = None
    ) -> Tuple[List[Dict], int, float, Dict]:
        """
        Lakukan semantic search menggunakan FAISS
        """
        start_time = time.time()
        
        if not self.is_loaded:
            self.load_index()
            
        if self.index is None or self.index.ntotal == 0:
            return [], 0, time.time() - start_time, {}
            
        # 1. Generate query embedding
        query_embedding = embedder_service.embed_text(query_text)
        query_embedding = np.expand_dims(query_embedding, axis=0)
        
        # 2. Search in FAISS
        # Ambil lebih banyak dari top_k jika ada filter, karena filter akan mengurangi hasil
        search_k = min(self.index.ntotal, max(top_k * 10, 500)) if filters else min(self.index.ntotal, top_k)
        
        # FAISS search: D, I = distances (similarity scores because of inner product), indices
        scores, indices = self.index.search(query_embedding, search_k)
        
        scores = scores[0]
        indices = indices[0]
        
        # 3. Kumpulkan ID artikel yang lolos threshold
        candidate_ids = []
        score_map = {} # Map ID artikel ke score
        distance_map = {}
        
        for i, idx in enumerate(indices):
            if idx == -1: # Padding dari FAISS
                continue
                
            score = float(scores[i])
            # Thresholding (score mendekati 1.0 = mirip)
            if score >= threshold:
                article_id = self.id_map.get(idx)
                if article_id:
                    candidate_ids.append(article_id)
                    score_map[article_id] = score
                    # Konversi similarity (0-1) ke distance (0-1) dimana 0 = identik
                    distance_map[article_id] = max(0.0, 1.0 - score)
                    
        if not candidate_ids:
            return [], 0, time.time() - start_time, {}
            
        # 4. Ambil dari database dan terapkan filter
        with get_db_context() as db:
            query = db.query(News).filter(News.id.in_(candidate_ids))
            
            # Terapkan filter SQL
            query = self._apply_filters_to_query(query, filters)
            
            articles = query.all()
            total_filtered = len(articles)
            
            # 5. Format hasil dan urutkan berdasarkan similarity score DESC
            results = []
            for article in articles:
                data = article.to_dict()
                data["similarity_score"] = score_map[article.id]
                data["distance"] = distance_map[article.id]
                results.append(data)
                
            # Urutkan berdasarkan similarity (tertinggi pertama, distance terendah)
            results.sort(key=lambda x: x["similarity_score"], reverse=True)
            
            # Potong ke top_k
            results = results[:top_k]
            
            # Hitung filter yang diterapkan
            filters_applied = {}
            if filters:
                filters_applied = filters.model_dump(exclude_none=True)
                
            query_time = time.time() - start_time
            
            # Log pencarian
            self._log_search("semantic", query_text, filters, total_filtered, query_time)
            
            return results, total_filtered, query_time, filters_applied

    def keyword_search(
        self,
        keywords: List[str],
        match_type: MatchType = MatchType.all,
        page: int = 1,
        limit: int = 20,
        filters: Optional[SearchFilters] = None,
        sort_by: str = "published_date",
        sort_order: str = "desc"
    ) -> Tuple[List[Dict], int, float]:
        """
        Lakukan keyword search menggunakan MySQL FULLTEXT atau ILIKE
        """
        start_time = time.time()
        
        with get_db_context() as db:
            query = db.query(News)
            
            # 1. Terapkan keyword matching
            conditions = []
            for kw in keywords:
                # Gunakan ILIKE untuk keyword matching (bisa juga MySQL FULLTEXT MATCH AGAINST)
                # ILIKE lebih aman untuk substring bebas
                term = f"%{kw}%"
                condition = or_(News.title.ilike(term), News.content.ilike(term))
                conditions.append(condition)
                
            if conditions:
                if match_type == MatchType.all:
                    query = query.filter(and_(*conditions))
                else: # MatchType.any
                    query = query.filter(or_(*conditions))
                    
            # 2. Terapkan Filters
            query = self._apply_filters_to_query(query, filters)
            
            # 3. Hitung total
            total = query.count()
            
            # 4. Sorting
            if sort_by == "published_date":
                order_col = News.published_date.desc() if sort_order == "desc" else News.published_date.asc()
            elif sort_by == "scraped_at":
                order_col = News.scraped_at.desc() if sort_order == "desc" else News.scraped_at.asc()
            else: # relevance - pada basic keyword search kita sort by id aja atau date
                order_col = News.published_date.desc()
                
            query = query.order_by(order_col)
            
            # 5. Pagination
            offset = (page - 1) * limit
            articles = query.offset(offset).limit(limit).all()
            
            results = [a.to_dict() for a in articles]
            query_time = time.time() - start_time
            
            # Log pencarian
            self._log_search("keyword", ", ".join(keywords), filters, total, query_time)
            
            return results, total, query_time

    def hybrid_search(
        self,
        query_text: str,
        keywords: Optional[List[str]] = None,
        semantic_weight: float = 0.7,
        top_k: int = 20,
        filters: Optional[SearchFilters] = None
    ) -> Tuple[List[Dict], int, float]:
        """
        Kombinasi Semantic Search (FAISS) dan Keyword Search.
        """
        start_time = time.time()
        
        # 1. Ambil kandidat dari Semantic Search dengan threshold rendah
        semantic_results, _, _, _ = self.semantic_search(
            query_text=query_text,
            top_k=max(top_k * 5, 100), # Ambil lebih banyak untuk re-ranking
            threshold=0.0,
            filters=filters
        )
        
        if not semantic_results:
            return [], 0, time.time() - start_time
            
        keyword_weight = 1.0 - semantic_weight
        
        # 2. Jika ada keyword, re-rank
        if keywords and keyword_weight > 0:
            for item in semantic_results:
                # Hitung score keyword sederhana (frekuensi kata di text)
                keyword_score = 0.0
                text_to_search = f"{item['title']} {item['content']}".lower()
                
                for kw in keywords:
                    kw_lower = kw.lower()
                    if kw_lower in text_to_search:
                        # Bonus lebih jika ada di judul
                        if kw_lower in item['title'].lower():
                            keyword_score += 0.5
                        keyword_score += 0.5
                        
                # Normalisasi skor keyword (maksimal 1.0)
                max_possible = len(keywords) * 1.0
                normalized_kw_score = min(1.0, keyword_score / max_possible) if max_possible > 0 else 0
                
                item['keyword_score'] = normalized_kw_score
                
                # Combine score
                item['combined_score'] = (item['similarity_score'] * semantic_weight) + (normalized_kw_score * keyword_weight)
        else:
            # Jika tidak ada keyword, combined_score = similarity_score
            for item in semantic_results:
                item['keyword_score'] = 0.0
                item['combined_score'] = item['similarity_score']
                
        # 3. Urutkan berdasarkan combined_score DESC
        semantic_results.sort(key=lambda x: x['combined_score'], reverse=True)
        
        # 4. Potong ke top_k
        final_results = semantic_results[:top_k]
        
        query_time = time.time() - start_time
        
        # Log pencarian
        self._log_search("hybrid", query_text, filters, len(final_results), query_time)
        
        return final_results, len(semantic_results), query_time

    def _log_search(self, search_type: str, query: str, filters: Optional[SearchFilters], results_count: int, query_time: float):
        """Log aktivitas pencarian ke database (non-blocking jika gagal)"""
        try:
            with get_db_context() as db:
                filters_json = filters.model_dump(exclude_none=True) if filters else None
                log = SearchLog(
                    search_type=search_type,
                    query=query[:1000] if query else None,
                    filters=filters_json,
                    results_count=results_count,
                    query_time_ms=query_time * 1000  # Convert to ms
                )
                db.add(log)
        except Exception as e:
            self.logger.warning(f"Gagal mencatat log pencarian: {e}")


# Singleton instance
search_service = SearchService()
