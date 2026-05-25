"""
SQLAlchemy model untuk tabel news dan scraping_logs
"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime,
    Index, Enum as SAEnum, Float, JSON
)
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.sql import func

from app.database import Base


class News(Base):
    """Model untuk tabel news - menyimpan artikel berita"""
    __tablename__ = "news"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    title = Column(String(500), nullable=False, comment="Judul berita")
    content = Column(LONGTEXT, nullable=False, comment="Konten lengkap berita")
    url = Column(String(1000), unique=True, nullable=False, comment="URL artikel")
    source = Column(String(100), nullable=False, index=True, comment="Platform sumber")
    published_date = Column(DateTime, nullable=True, index=True, comment="Tanggal publikasi")
    category = Column(String(100), nullable=True, index=True, comment="Kategori berita")
    author = Column(String(200), nullable=True, comment="Penulis artikel")
    image_url = Column(String(1000), nullable=True, comment="URL gambar utama")
    scraped_at = Column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        index=True,
        comment="Waktu di-scrape"
    )
    updated_at = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        comment="Waktu update terakhir"
    )

    # Indeks komposit
    __table_args__ = (
        Index("idx_source_category", "source", "category"),
        Index("idx_source_date", "source", "published_date"),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
            "comment": "Tabel artikel berita yang di-scrape"
        }
    )

    def to_dict(self) -> dict:
        """Konversi model ke dictionary"""
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "url": self.url,
            "source": self.source,
            "published_date": self.published_date.isoformat() if self.published_date else None,
            "category": self.category,
            "author": self.author,
            "image_url": self.image_url,
            "scraped_at": self.scraped_at.isoformat() if self.scraped_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<News id={self.id} source={self.source} title={self.title[:50]}>"


class ScrapingLog(Base):
    """Model untuk tracking aktivitas scraping per platform"""
    __tablename__ = "scraping_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(String(100), nullable=False, index=True)
    started_at = Column(DateTime, server_default=func.now(), nullable=False)
    finished_at = Column(DateTime, nullable=True)
    articles_scraped = Column(Integer, default=0)
    articles_failed = Column(Integer, default=0)
    status = Column(
        SAEnum("running", "success", "failed", "partial", name="scraping_status"),
        default="running"
    )
    error_message = Column(Text, nullable=True)

    __table_args__ = (
        Index("idx_source_status", "source", "status"),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        }
    )

    def __repr__(self) -> str:
        return f"<ScrapingLog id={self.id} source={self.source} status={self.status}>"


class SearchLog(Base):
    """Model untuk tracking aktivitas pencarian"""
    __tablename__ = "search_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    search_type = Column(
        SAEnum("semantic", "keyword", "hybrid", "filter", name="search_type_enum"),
        nullable=False
    )
    query = Column(Text, nullable=True)
    filters = Column(JSON, nullable=True)
    results_count = Column(Integer, default=0)
    query_time_ms = Column(Float, nullable=True)
    searched_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    __table_args__ = (
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )
