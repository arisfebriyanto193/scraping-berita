"""
Detik.com Scraper
Website: https://www.detik.com
"""
import logging
import re
from datetime import datetime
from typing import List, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from dateutil import parser as dateparser

from app.scrapers.base import BaseScraper, ArticleData
from app.config import settings

logger = logging.getLogger(__name__)


class DetikScraper(BaseScraper):
    """Scraper untuk Detik.com"""

    SOURCE_NAME = "detik"
    BASE_URL = settings.DETIK_BASE_URL

    # Kategori Detik yang akan di-scrape
    CATEGORIES = {
        "news": f"{settings.DETIK_BASE_URL}/terpopuler",
    }

    def scrape_latest(self, max_articles: int = 20) -> List[ArticleData]:
        """Scrape artikel terbaru dari Detik.com"""
        articles = []
        urls_seen = set()

        for cat_name, cat_url in self.CATEGORIES.items():
            if len(articles) >= max_articles:
                break

            self.logger.info(f"Scraping Detik/{cat_name}: {cat_url}")
            soup = self._fetch(cat_url)
            if not soup:
                continue

            # Ambil link artikel dari halaman
            article_links = self._extract_article_links(soup)

            for url in article_links:
                if len(articles) >= max_articles:
                    break
                if url in urls_seen:
                    continue
                urls_seen.add(url)

                article = self.parse_article(url)
                if article and article.is_valid():
                    articles.append(article)
                    self.logger.info(f"✅ Detik: {article.title[:60]}")

        self.logger.info(f"Total scraped dari Detik: {len(articles)} artikel")
        return articles

    def _extract_article_links(self, soup: BeautifulSoup) -> List[str]:
        """Ekstrak URL artikel dari halaman listing Detik"""
        links = []

        # Selector untuk berbagai layout Detik
        selectors = [
            "article a[href]",
            ".list-content__item a[href]",
            ".media__link",
            "h2 a[href]",
            "h3 a[href]",
        ]

        for selector in selectors:
            found = soup.select(selector)
            for tag in found:
                href = tag.get("href", "")
                if self._is_valid_detik_url(href):
                    links.append(href)

        # Deduplicate
        seen = set()
        unique = []
        for link in links:
            if link not in seen:
                seen.add(link)
                unique.append(link)

        return unique

    def _is_valid_detik_url(self, url: str) -> bool:
        """Validasi URL artikel Detik"""
        if not url or not url.startswith("http"):
            return False
        detik_domains = [
            "detik.com", "finance.detik.com", "sport.detik.com",
            "inet.detik.com", "hot.detik.com", "news.detik.com",
            "health.detik.com", "travel.detik.com", "oto.detik.com",
            "food.detik.com", "wolipop.detik.com"
        ]
        return any(domain in url for domain in detik_domains)

    def parse_article(self, url: str) -> Optional[ArticleData]:
        """Parse detail artikel dari URL Detik.com"""
        soup = self._fetch(url)
        if not soup:
            return None

        try:
            # Title
            title = ""
            title_el = (
                soup.find("h1", class_="detail__title")
                or soup.find("h1", class_="title")
                or soup.find("h1")
            )
            if title_el:
                title = self._clean_text(title_el.get_text())

            # Content - Detik memakai berbagai class
            content = ""
            content_el = (
                soup.find("div", class_="detail__body-text")
                or soup.find("div", class_="itp_bodycontent")
                or soup.find("div", {"id": "detikdetailtext"})
                or soup.find("article")
            )
            if content_el:
                # Hapus elemen yang tidak perlu
                for tag in content_el.find_all(["script", "style", "figure", "aside", ".ads"]):
                    tag.decompose()
                content = self._clean_text(content_el.get_text(separator=" "))

            # Published date
            published_date = None
            date_el = (
                soup.find("div", class_="detail__date")
                or soup.find("span", class_="date")
                or soup.find("time")
            )
            if date_el:
                date_text = date_el.get("datetime") or date_el.get_text()
                published_date = self._parse_date(date_text)

            # Author
            author = None
            author_el = (
                soup.find("div", class_="detail__author")
                or soup.find("span", class_="author")
            )
            if author_el:
                author = self._clean_text(author_el.get_text())

            # Category
            category = self._extract_category(url)

            # Image
            image_url = self._extract_image(soup, url)

            return ArticleData(
                title=title,
                content=content,
                url=url,
                source=self.SOURCE_NAME,
                published_date=published_date,
                category=category,
                author=author,
                image_url=image_url,
            )

        except Exception as e:
            self.logger.error(f"Error parse Detik article {url}: {e}")
            return None

    def _extract_category(self, url: str) -> str:
        """Ekstrak kategori dari URL Detik"""
        category_map = {
            "finance.detik.com": "ekonomi",
            "sport.detik.com": "olahraga",
            "inet.detik.com": "teknologi",
            "hot.detik.com": "hiburan",
            "health.detik.com": "kesehatan",
            "travel.detik.com": "travel",
            "oto.detik.com": "otomotif",
            "food.detik.com": "kuliner",
            "wolipop.detik.com": "gaya hidup",
            "news.detik.com": "nasional",
        }
        for domain, cat in category_map.items():
            if domain in url:
                return cat
        return "umum"

    def _parse_date(self, date_text: str) -> Optional[datetime]:
        """Parse tanggal dari Detik (berbagai format)"""
        if not date_text:
            return None
        try:
            # Bersihkan teks
            date_text = date_text.strip()

            # Format Detik: "Senin, 15 Jan 2024 10:00 WIB"
            day_names = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
            for day in day_names:
                date_text = date_text.replace(f"{day}, ", "")

            date_text = date_text.replace(" WIB", "").replace(" WITA", "").replace(" WIT", "")

            # Mapping bulan Indonesia
            month_map = {
                "Jan": "Jan", "Feb": "Feb", "Mar": "Mar", "Apr": "Apr",
                "Mei": "May", "Jun": "Jun", "Jul": "Jul", "Agu": "Aug",
                "Sep": "Sep", "Okt": "Oct", "Nov": "Nov", "Des": "Dec",
                "Januari": "January", "Februari": "February", "Maret": "March",
                "April": "April", "Juni": "June", "Juli": "July",
                "Agustus": "August", "September": "September", "Oktober": "October",
                "November": "November", "Desember": "December"
            }
            for ind, eng in month_map.items():
                date_text = date_text.replace(ind, eng)

            return dateparser.parse(date_text, dayfirst=True)
        except Exception:
            return None
