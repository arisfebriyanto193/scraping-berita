"""
Embedding Service - mengelola Sentence Transformer model dan pembuatan embedding.
Model: paraphrase-multilingual-MiniLM-L12-v2 (mendukung Bahasa Indonesia)
"""
import logging
import os
import pickle
from typing import List, Optional, Tuple

import numpy as np

from app.config import settings

logger = logging.getLogger(__name__)


class EmbedderService:
    """
    Service untuk membuat embedding menggunakan Sentence Transformers.
    
    Fitur:
    - Lazy loading model (dimuat saat pertama kali dipakai)
    - Batch processing untuk efisiensi
    - L2 normalization untuk cosine similarity via dot product
    - Caching model di memory
    """

    _instance = None
    _model = None
    _model_loaded = False

    def __new__(cls):
        """Singleton pattern"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def load_model(self):
        """
        Load Sentence Transformer model ke memory.
        Dipanggil saat startup aplikasi.
        """
        if self._model_loaded:
            logger.info("✅ Model embedding sudah di-load sebelumnya")
            return

        try:
            logger.info(f"⏳ Loading model: {settings.EMBEDDING_MODEL}...")
            # Import di sini untuk lazy loading
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(settings.EMBEDDING_MODEL)
            self._model_loaded = True
            logger.info(f"✅ Model {settings.EMBEDDING_MODEL} berhasil di-load")
            logger.info(f"   Embedding dimension: {settings.EMBEDDING_DIMENSION}")
        except Exception as e:
            logger.error(f"❌ Gagal load model: {e}")
            raise

    def _ensure_model_loaded(self):
        """Pastikan model sudah di-load"""
        if not self._model_loaded:
            self.load_model()

    def embed_text(self, text: str) -> np.ndarray:
        """
        Buat embedding untuk satu teks.
        
        Args:
            text: Teks yang akan di-embed
            
        Returns:
            Numpy array embedding yang sudah dinormalisasi (shape: [384])
        """
        self._ensure_model_loaded()

        if not text or not text.strip():
            # Return zero vector jika teks kosong
            return np.zeros(settings.EMBEDDING_DIMENSION, dtype=np.float32)

        # Truncate teks yang terlalu panjang (max 512 token)
        text = text[:3000]

        embedding = self._model.encode(
            text,
            normalize_embeddings=True,  # L2 normalization
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return embedding.astype(np.float32)

    def embed_batch(self, texts: List[str]) -> np.ndarray:
        """
        Buat embedding untuk batch teks.
        
        Args:
            texts: List teks yang akan di-embed
            
        Returns:
            Numpy array 2D (shape: [n, 384]) yang sudah dinormalisasi
        """
        self._ensure_model_loaded()

        if not texts:
            return np.zeros((0, settings.EMBEDDING_DIMENSION), dtype=np.float32)

        # Truncate teks panjang
        processed_texts = [t[:3000] if t else "" for t in texts]

        # Ganti teks kosong dengan placeholder
        processed_texts = [t if t.strip() else "berita" for t in processed_texts]

        logger.info(f"⏳ Membuat embedding untuk {len(processed_texts)} teks...")
        
        embeddings = self._model.encode(
            processed_texts,
            batch_size=settings.BATCH_SIZE,
            normalize_embeddings=True,   # L2 normalization
            show_progress_bar=len(processed_texts) > 50,
            convert_to_numpy=True,
        )
        logger.info(f"✅ Embedding selesai: shape {embeddings.shape}")
        return embeddings.astype(np.float32)

    def embed_article(self, title: str, content: str) -> np.ndarray:
        """
        Buat embedding dari judul + konten artikel.
        Prioritaskan judul dengan mengulanginya 3x.
        
        Args:
            title: Judul artikel
            content: Konten artikel (akan dipotong)
            
        Returns:
            Embedding yang sudah dinormalisasi
        """
        # Gabungkan: judul (3x untuk penguatan) + konten (500 karakter pertama)
        combined_text = f"{title} {title} {title} {content[:500]}"
        return self.embed_text(combined_text)

    def compute_similarity(self, embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """
        Hitung cosine similarity antara dua embedding.
        
        Karena embedding sudah dinormalisasi (L2), cosine similarity = dot product.
        Score: 1.0 = identik, 0.0 = tidak relevan, -1.0 = berlawanan
        
        Catatan untuk user: Semakin mendekati 1.0, semakin relevan.
        Distance = 1 - similarity (semakin kecil = lebih baik)
        
        Args:
            embedding1, embedding2: Normalized embedding vectors
            
        Returns:
            Similarity score antara 0.0 dan 1.0
        """
        similarity = float(np.dot(embedding1, embedding2))
        # Clamp ke [0, 1]
        return max(0.0, min(1.0, similarity))

    @property
    def is_loaded(self) -> bool:
        return self._model_loaded

    @property
    def model_name(self) -> str:
        return settings.EMBEDDING_MODEL


# Singleton instance
embedder_service = EmbedderService()
