"""
Base scraper class - semua platform scraper mewarisi class ini.
Menyediakan: HTTP requests, user-agent rotation, retry, rate limiting, logging.
"""
import logging
import random
import time
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Optional, List, Dict, Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from app.config import settings

logger = logging.getLogger(__name__)


class ArticleData:
    """Data class untuk menyimpan data artikel hasil scraping"""
    __slots__ = [
        "title", "content", "url", "source",
        "published_date", "category", "author", "image_url"
    ]

    def __init__(
        self,
        title: str,
        content: str,
        url: str,
        source: str,
        published_date: Optional[datetime] = None,
        category: Optional[str] = None,
        author: Optional[str] = None,
        image_url: Optional[str] = None,
    ):
        self.title = title.strip() if title else ""
        self.content = content.strip() if content else ""
        self.url = url.strip() if url else ""
        self.source = source
        self.published_date = published_date
        self.category = category.strip().lower() if category else None
        self.author = author.strip() if author else None
        self.image_url = image_url.strip() if image_url else None

    def is_valid(self) -> bool:
        """Cek apakah artikel memiliki data minimal yang diperlukan"""
        return bool(
            self.title
            and len(self.title) > 10
            and self.content
            and len(self.content) > 100
            and self.url
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "content": self.content,
            "url": self.url,
            "source": self.source,
            "published_date": self.published_date,
            "category": self.category,
            "author": self.author,
            "image_url": self.image_url,
        }


class BaseScraper(ABC):
    """
    Abstract base class untuk semua platform scrapers.
    
    Semua scraper harus mengimplementasikan:
    - scrape_latest(max_articles) -> List[ArticleData]
    - parse_article(url) -> Optional[ArticleData]
    """

    SOURCE_NAME: str = ""   # Override di subclass
    BASE_URL: str = ""      # Override di subclass

    def __init__(self):
        self.session = self._create_session()
        self.logger = logging.getLogger(f"scraper.{self.SOURCE_NAME}")

    def _create_session(self) -> requests.Session:
        """Buat requests session dengan retry otomatis"""
        session = requests.Session()

        retry_strategy = Retry(
            total=settings.MAX_RETRIES,
            backoff_factor=2,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "HEAD"],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        return session

    def _get_random_user_agent(self) -> str:
        """Rotasi User-Agent secara acak"""
        return random.choice(settings.USER_AGENTS_LIST)

    def _get_headers(self) -> Dict[str, str]:
        """Header default untuk HTTP requests"""
        return {
            "User-Agent": self._get_random_user_agent(),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Cache-Control": "max-age=0",
        }

    def _rate_limit(self):
        """Delay acak antara requests untuk menghindari rate limiting"""
        delay = random.uniform(settings.SCRAPING_DELAY_MIN, settings.SCRAPING_DELAY_MAX)
        time.sleep(delay)

    def _fetch(self, url: str, params: dict = None) -> Optional[BeautifulSoup]:
        """
        Fetch URL dan kembalikan BeautifulSoup object.
        Menangani error dan retry secara otomatis.
        """
        for attempt in range(1, settings.MAX_RETRIES + 1):
            try:
                self._rate_limit()
                response = self.session.get(
                    url,
                    headers=self._get_headers(),
                    params=params,
                    timeout=settings.SCRAPING_TIMEOUT,
                    allow_redirects=True,
                )
                response.raise_for_status()
                response.encoding = response.apparent_encoding or "utf-8"
                # Gunakan html.parser bawaan Python agar lebih kompatibel di Raspberry Pi
                soup = BeautifulSoup(response.text, "html.parser")
                self.logger.debug(f"✅ Fetched: {url}")
                return soup

            except requests.exceptions.HTTPError as e:
                status = e.response.status_code if e.response else "?"
                self.logger.warning(f"HTTP {status} pada {url} (attempt {attempt})")
                if status in [403, 404, 410]:
                    return None  # Jangan retry untuk error permanent
                if attempt < settings.MAX_RETRIES:
                    time.sleep(attempt * 3)

            except requests.exceptions.ConnectionError as e:
                self.logger.warning(f"Connection error {url}: {e} (attempt {attempt})")
                if attempt < settings.MAX_RETRIES:
                    time.sleep(attempt * 5)

            except requests.exceptions.Timeout:
                self.logger.warning(f"Timeout {url} (attempt {attempt})")
                if attempt < settings.MAX_RETRIES:
                    time.sleep(attempt * 3)

            except Exception as e:
                self.logger.error(f"Error fetch {url}: {e}")
                return None

        self.logger.error(f"❌ Gagal fetch setelah {settings.MAX_RETRIES} percobaan: {url}")
        return None

    def _clean_text(self, text: str) -> str:
        """Bersihkan whitespace berlebih dari teks"""
        if not text:
            return ""
        import re
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    def _extract_image(self, soup: BeautifulSoup, base_url: str = "") -> Optional[str]:
        """Ekstrak URL gambar utama dari halaman"""
        # Coba og:image dulu
        og_image = soup.find("meta", property="og:image")
        if og_image and og_image.get("content"):
            return og_image["content"]

        # Coba twitter:image
        tw_image = soup.find("meta", {"name": "twitter:image"})
        if tw_image and tw_image.get("content"):
            return tw_image["content"]

        # Coba gambar pertama di konten
        first_img = soup.find("img")
        if first_img and first_img.get("src"):
            src = first_img["src"]
            if src.startswith("http"):
                return src
            elif base_url:
                return urljoin(base_url, src)

        return None

    def _extract_meta_description(self, soup: BeautifulSoup) -> str:
        """Ekstrak meta description dari halaman"""
        meta = soup.find("meta", {"name": "description"})
        if meta and meta.get("content"):
            return meta["content"]
        og_desc = soup.find("meta", property="og:description")
        if og_desc and og_desc.get("content"):
            return og_desc["content"]
        return ""

    def _is_valid_url(self, url: str) -> bool:
        """Validasi URL"""
        try:
            parsed = urlparse(url)
            return all([parsed.scheme in ["http", "https"], parsed.netloc])
        except Exception:
            return False

    @abstractmethod
    def scrape_latest(self, max_articles: int = 20) -> List[ArticleData]:
        """
        Scrape artikel terbaru dari platform.
        
        Args:
            max_articles: Jumlah maksimum artikel yang akan di-scrape
            
        Returns:
            List of ArticleData objects
        """
        pass

    @abstractmethod
    def parse_article(self, url: str) -> Optional[ArticleData]:
        """
        Parse detail artikel dari URL.
        
        Args:
            url: URL artikel yang akan di-parse
            
        Returns:
            ArticleData jika berhasil, None jika gagal
        """
        pass

    def extract_metadata(self, soup: BeautifulSoup, url: str) -> Dict[str, Any]:
        """
        Extract metadata umum dari halaman (bisa dioverride per platform).
        
        Returns dict dengan: title, description, image_url, published_date
        """
        metadata = {}

        # Title
        og_title = soup.find("meta", property="og:title")
        if og_title:
            metadata["title"] = og_title.get("content", "")
        elif soup.title:
            metadata["title"] = soup.title.string or ""

        # Image
        metadata["image_url"] = self._extract_image(soup, url)

        # Description
        metadata["description"] = self._extract_meta_description(soup)

        return metadata
