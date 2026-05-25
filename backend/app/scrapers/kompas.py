"""
Kompas.com Scraper
Website: https://www.kompas.com
"""
import logging
from datetime import datetime
from typing import List, Optional

from bs4 import BeautifulSoup
from dateutil import parser as dateparser

from app.scrapers.base import BaseScraper, ArticleData
from app.config import settings

logger = logging.getLogger(__name__)


class KompasScraper(BaseScraper):
    """Scraper untuk Kompas.com"""

    SOURCE_NAME = "kompas"
    BASE_URL = settings.KOMPAS_BASE_URL

    SECTIONS = [
        f"{settings.KOMPAS_BASE_URL}/tag/berita-terkini",
        f"{settings.KOMPAS_BASE_URL}/nasional",
        f"{settings.KOMPAS_BASE_URL}/regional",
        f"{settings.KOMPAS_BASE_URL}/money",
        f"{settings.KOMPAS_BASE_URL}/tekno",
    ]

    def scrape_latest(self, max_articles: int = 20) -> List[ArticleData]:
        articles = []
        urls_seen = set()

        for section_url in self.SECTIONS:
            if len(articles) >= max_articles:
                break

            self.logger.info(f"Scraping Kompas: {section_url}")
            soup = self._fetch(section_url)
            if not soup:
                continue

            links = self._extract_article_links(soup)
            for url in links:
                if len(articles) >= max_articles:
                    break
                if url in urls_seen:
                    continue
                urls_seen.add(url)

                article = self.parse_article(url)
                if article and article.is_valid():
                    articles.append(article)
                    self.logger.info(f"✅ Kompas: {article.title[:60]}")

        self.logger.info(f"Total scraped dari Kompas: {len(articles)} artikel")
        return articles

    def _extract_article_links(self, soup: BeautifulSoup) -> List[str]:
        links = []
        for tag in soup.find_all("a", href=True):
            href = tag["href"]
            if (
                "kompas.com" in href
                and "/read/" in href
                and href.startswith("http")
            ):
                links.append(href)
        # Deduplicate
        return list(dict.fromkeys(links))

    def parse_article(self, url: str) -> Optional[ArticleData]:
        soup = self._fetch(url)
        if not soup:
            return None

        try:
            # Title
            title = ""
            title_el = soup.find("h1", class_="read__title") or soup.find("h1")
            if title_el:
                title = self._clean_text(title_el.get_text())

            # Content
            content = ""
            content_el = soup.find("div", class_="read__content") or soup.find("article")
            if content_el:
                for tag in content_el.find_all(["script", "style", "aside", "figure"]):
                    tag.decompose()
                content = self._clean_text(content_el.get_text(separator=" "))

            # Date - Kompas format: "Senin, 15 Januari 2024 | 10:00 WIB"
            published_date = None
            date_el = soup.find("div", class_="read__time") or soup.find("time")
            if date_el:
                date_text = date_el.get("datetime") or date_el.get_text()
                published_date = self._parse_date(date_text)

            # Author
            author = None
            author_el = soup.find("div", class_="credit-title-name") or soup.find("span", class_="author")
            if author_el:
                author = self._clean_text(author_el.get_text())

            # Category
            category = self._extract_category(url, soup)

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
            self.logger.error(f"Error parse Kompas {url}: {e}")
            return None

    def _extract_category(self, url: str, soup: BeautifulSoup) -> str:
        # Dari URL: kompas.com/nasional/read/...
        parts = url.split("/")
        category_map = {
            "nasional": "nasional",
            "regional": "regional",
            "money": "ekonomi",
            "tekno": "teknologi",
            "sains": "sains",
            "bola": "olahraga",
            "entertainment": "hiburan",
            "lifestyle": "gaya hidup",
            "properti": "properti",
            "otomotif": "otomotif",
            "edukasi": "pendidikan",
            "global": "internasional",
        }
        for part in parts:
            if part.lower() in category_map:
                return category_map[part.lower()]
        return "umum"

    def _parse_date(self, date_text: str) -> Optional[datetime]:
        if not date_text:
            return None
        try:
            date_text = date_text.strip()
            day_names = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
            for day in day_names:
                date_text = date_text.replace(f"{day}, ", "")

            date_text = (
                date_text.replace(" WIB", "").replace(" WITA", "").replace(" WIT", "")
                         .replace("|", "").strip()
            )

            month_map = {
                "Januari": "January", "Februari": "February", "Maret": "March",
                "April": "April", "Mei": "May", "Juni": "June", "Juli": "July",
                "Agustus": "August", "September": "September", "Oktober": "October",
                "November": "November", "Desember": "December"
            }
            for ind, eng in month_map.items():
                date_text = date_text.replace(ind, eng)

            return dateparser.parse(date_text, dayfirst=True)
        except Exception:
            return None
