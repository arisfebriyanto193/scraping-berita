"""
Embedding Service - Otomatis memilih backend berdasarkan library yang tersedia.

Mode 1 (PC/Server Normal):  sentence-transformers + torch
Mode 2 (Raspberry Pi/Ringan): fastembed + onnxruntime (~10x lebih hemat RAM)

Cara kerja auto-detect:
  - Coba import fastembed dulu (Raspberry Pi mode)
  - Jika tidak ada, fallback ke sentence-transformers (PC mode)
  - Bisa dipaksa via env: EMBEDDING_BACKEND=fastembed / sentence_transformers
"""
import logging
import os
from typing import List

import numpy as np

from app.config import settings

logger = logging.getLogger(__name__)

# Deteksi backend dari ENV variable (opsional, bisa dipaksa)
FORCED_BACKEND = os.getenv("EMBEDDING_BACKEND", "auto").lower()


class EmbedderService:
    """
    Service untuk membuat embedding - mendukung dua backend:
    
    1. sentence-transformers (PC): Kompatibel 100% dengan model asli
    2. fastembed (Raspberry Pi):   ONNX-based, RAM 10x lebih hemat
    """

    _instance = None
    _model = None
    _model_loaded = False
    _backend = None  # 'sentence_transformers' atau 'fastembed'

    def __new__(cls):
        """Singleton pattern"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def load_model(self):
        """
        Load model secara otomatis berdasarkan library yang tersedia.
        """
        if self._model_loaded:
            logger.info("✅ Model embedding sudah di-load sebelumnya")
            return

        if FORCED_BACKEND == "fastembed":
            self._load_fastembed()
        elif FORCED_BACKEND == "sentence_transformers":
            self._load_sentence_transformers()
        else:
            # Auto-detect: coba fastembed dulu (lebih ringan)
            # Jika tidak ada, fallback ke sentence-transformers
            try:
                self._load_fastembed()
            except ImportError:
                logger.info("ℹ️ fastembed tidak tersedia, mencoba sentence-transformers...")
                self._load_sentence_transformers()

    def _load_fastembed(self):
        """
        Load model menggunakan fastembed (ONNX).
        RAM: ~200-400MB (vs ~1.2GB sentence-transformers+torch)
        """
        import shutil
        from fastembed import TextEmbedding

        # Model multilingual via ONNX - urutan prioritas (dari paling ringan)
        FASTEMBED_MODELS = [
            "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
            "BAAI/bge-m3",  # fallback multilingual yang lebih stabil
        ]

        last_error = None
        for model_name in FASTEMBED_MODELS:
            try:
                logger.info(f"⏳ [RASPI MODE] Loading fastembed model: {model_name}...")
                self._model = TextEmbedding(model_name=model_name)
                # Warm-up test: pastikan model benar-benar bisa dipakai
                test_result = list(self._model.embed(["test"]))
                if not test_result:
                    raise ValueError("Model menghasilkan output kosong")

                self._backend = "fastembed"
                self._model_loaded = True
                logger.info(f"✅ [RASPI MODE] Model '{model_name}' berhasil di-load (ONNX, hemat RAM!)")
                return

            except Exception as e:
                last_error = e
                logger.warning(f"⚠️ Gagal load model '{model_name}': {e}")

                # Jika error terkait file tidak ditemukan, hapus cache korup dan coba lagi
                if "NO_SUCHFILE" in str(e) or "File doesn't exist" in str(e) or "does not exist" in str(e):
                    cache_dir = "/tmp/fastembed_cache"
                    if os.path.exists(cache_dir):
                        logger.info(f"🧹 Menghapus cache korup: {cache_dir}")
                        shutil.rmtree(cache_dir, ignore_errors=True)
                    logger.info(f"🔄 Mencoba download ulang model...")
                    try:
                        self._model = TextEmbedding(model_name=model_name)
                        test_result = list(self._model.embed(["test"]))
                        if test_result:
                            self._backend = "fastembed"
                            self._model_loaded = True
                            logger.info(f"✅ [RASPI MODE] Model '{model_name}' berhasil di-load setelah cache di-reset!")
                            return
                    except Exception as e2:
                        logger.warning(f"⚠️ Retry gagal untuk '{model_name}': {e2}")
                        last_error = e2
                        continue

        raise ImportError(f"Semua fastembed model gagal di-load. Error terakhir: {last_error}")


    def _load_sentence_transformers(self):
        """
        Load model menggunakan sentence-transformers (PyTorch).
        RAM: ~1.2GB (untuk PC/Server)
        """
        from sentence_transformers import SentenceTransformer
        
        logger.info(f"⏳ [PC MODE] Loading sentence-transformers model: {settings.EMBEDDING_MODEL}...")
        self._model = SentenceTransformer(settings.EMBEDDING_MODEL)
        self._backend = "sentence_transformers"
        self._model_loaded = True
        logger.info(f"✅ [PC MODE] Model {settings.EMBEDDING_MODEL} berhasil di-load")

    def _ensure_model_loaded(self):
        """Pastikan model sudah di-load"""
        if not self._model_loaded:
            self.load_model()

    def embed_text(self, text: str) -> np.ndarray:
        """
        Buat embedding untuk satu teks.

        Returns:
            Numpy array embedding yang sudah dinormalisasi (shape: [384])
        """
        self._ensure_model_loaded()

        if not text or not text.strip():
            return np.zeros(settings.EMBEDDING_DIMENSION, dtype=np.float32)

        # Truncate teks yang terlalu panjang
        text = text[:3000]

        if self._backend == "fastembed":
            # fastembed mengembalikan generator
            embeddings = list(self._model.embed([text]))
            embedding = np.array(embeddings[0], dtype=np.float32)
        else:
            # sentence-transformers
            embedding = self._model.encode(
                text,
                normalize_embeddings=True,
                show_progress_bar=False,
                convert_to_numpy=True,
            )
            embedding = embedding.astype(np.float32)

        # L2 normalization (pastikan sudah ternormalisasi)
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm

        return embedding

    def embed_batch(self, texts: List[str]) -> np.ndarray:
        """
        Buat embedding untuk batch teks.

        Returns:
            Numpy array 2D (shape: [n, 384]) yang sudah dinormalisasi
        """
        self._ensure_model_loaded()

        if not texts:
            return np.zeros((0, settings.EMBEDDING_DIMENSION), dtype=np.float32)

        # Truncate dan bersihkan teks
        processed_texts = [
            (t[:3000] if t else "berita").strip() or "berita"
            for t in texts
        ]

        logger.info(f"⏳ Membuat embedding untuk {len(processed_texts)} teks [{self._backend}]...")

        if self._backend == "fastembed":
            # fastembed batch embedding
            embeddings_gen = self._model.embed(processed_texts)
            embeddings = np.array(list(embeddings_gen), dtype=np.float32)
        else:
            # sentence-transformers batch embedding
            embeddings = self._model.encode(
                processed_texts,
                batch_size=settings.BATCH_SIZE,
                normalize_embeddings=True,
                show_progress_bar=len(processed_texts) > 50,
                convert_to_numpy=True,
            )
            embeddings = embeddings.astype(np.float32)

        # Normalisasi per-baris
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)  # Hindari division by zero
        embeddings = embeddings / norms

        logger.info(f"✅ Embedding selesai: shape {embeddings.shape}")
        return embeddings

    def embed_article(self, title: str, content: str) -> np.ndarray:
        """
        Buat embedding dari judul + konten artikel.
        Prioritaskan judul dengan mengulanginya 3x.
        """
        combined_text = f"{title} {title} {title} {content[:500]}"
        return self.embed_text(combined_text)

    def compute_similarity(self, embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """
        Hitung cosine similarity (dot product karena vector sudah ternormalisasi).
        Score 1.0 = identik, 0.0 = tidak relevan.
        """
        similarity = float(np.dot(embedding1, embedding2))
        return max(0.0, min(1.0, similarity))

    @property
    def is_loaded(self) -> bool:
        return self._model_loaded

    @property
    def model_name(self) -> str:
        return f"{settings.EMBEDDING_MODEL} [{self._backend or 'not loaded'}]"


# Singleton instance
embedder_service = EmbedderService()
