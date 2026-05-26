"""
Database connection, session management, dan base model SQLAlchemy
"""
import logging
from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool

from app.config import settings

logger = logging.getLogger(__name__)

# =========================================================
# ENGINE SETUP
# =========================================================
engine = create_engine(
    settings.DATABASE_URL,
    poolclass=QueuePool,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,          # Cek koneksi sebelum dipakai
    pool_recycle=3600,           # Recycle koneksi setiap 1 jam
    echo=settings.DEBUG,         # Log SQL query saat DEBUG mode
    connect_args={
        "connect_timeout": 10,
        "charset": "utf8mb4",
    }
)

# =========================================================
# SESSION FACTORY
# =========================================================
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# =========================================================
# BASE MODEL
# =========================================================
Base = declarative_base()


# =========================================================
# DEPENDENCY INJECTION - FastAPI
# =========================================================
def get_db() -> Generator[Session, None, None]:
    """
    Dependency untuk mendapatkan database session.
    Digunakan di FastAPI route dengan Depends(get_db).
    """
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database session error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """
    Context manager untuk database session (digunakan di luar FastAPI routes).
    Contoh: with get_db_context() as db: ...
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception as e:
        logger.error(f"Database context error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


# =========================================================
# DATABASE INITIALIZATION
# =========================================================
def create_tables():
    """Buat semua tabel yang belum ada di database"""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Tabel database berhasil dibuat/diverifikasi")
    except Exception as e:
        logger.error(f"❌ Gagal membuat tabel: {e}")
        raise


def check_database_connection() -> bool:
    """
    Cek koneksi ke database MySQL.
    Return True jika berhasil, False jika gagal.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("✅ Koneksi database MySQL berhasil")
        return True
    except Exception as e:
        logger.error(f"❌ Koneksi database gagal: {e}")
        return False


def get_db_stats() -> dict:
    """Dapatkan statistik pool koneksi database"""
    pool = engine.pool
    return {
        "pool_size": pool.size(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "checked_in": pool.checkedin(),
    }
