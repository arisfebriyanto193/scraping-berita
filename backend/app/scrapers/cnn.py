"""
CNN Indonesia Scraper
Website: https://www.cnnindonesia.com
"""
import logging
from datetime import datetime
from typing import List, Optional

from bs4 import BeautifulSoup
from dateutil import parser as dateparser

from app.scrapers.base import BaseScraper, ArticleData
from app.config import settings

logger = logging.getLogger(__name__)


class CNNScraper(BaseScraper):
    """Scraper untuk CNN Indonesia"""

    SOURCE_NAME = "cnn"
    BASE_URL = settings.CNN_BASE_URL

    SECTIONS = [
        f"{settings.CNN_BASE_URL}/nasional",
    ]

    def scrape_latest(self, max_articles: int = 20) -> List[ArticleData]:
        articles = []
        urls_seen = set()

        for section_url in self.SECTIONS:
            if len(articles) >= max_articles:
                break
            self.logger.info(f"Scraping CNN Indonesia: {section_url}")
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
                    self.logger.info(f"✅ CNN: {article.title[:60]}")

        self.logger.info(f"Total scraped dari CNN: {len(articles)} artikel")
        return articles

    def _extract_article_links(self, soup: BeautifulSoup) -> List[str]:
        links = []
        # CNN Indonesia pakai tag article atau div.list-item
        for tag in soup.find_all("a", href=True):
            href = tag["href"]
            if (
                "cnnindonesia.com" in href
                and href.startswith("http")
                and any(seg in href for seg in ["/nasional/", "/ekonomi/", "/internasional/",
                                                "/teknologi/", "/olahraga/", "/hiburan/",
                                                "/gaya-hidup/", "/politik/"])
            ):
                links.append(href.split("?")[0])  # Hapus query params
        return list(dict.fromkeys(links))

    def parse_article(self, url: str) -> Optional[ArticleData]:
        soup = self._fetch(url)
        if not soup:
            return None

        try:
            # Title
            title = ""
            title_el = soup.find("h1", class_="title") or soup.find("h1")
            if title_el:
                title = self._clean_text(title_el.get_text())

            # Content
            content = ""
            content_el = (
                soup.find("div", class_="detail-text")
                or soup.find("div", {"id": "detailText"})
                or soup.find("article")
            )
            if content_el:
                for tag in content_el.find_all(["script", "style", "aside"]):
                    tag.decompose()
                content = self._clean_text(content_el.get_text(separator=" "))

            # Date
            published_date = None
            date_el = (
                soup.find("div", class_="date")
                or soup.find("span", class_="publish_date")
                or soup.find("time")
            )
            if date_el:
                date_str = date_el.get("datetime") or date_el.get_text()
                published_date = self._parse_date(date_str)

            # Author
            author = None
            author_el = soup.find("div", class_="author") or soup.find("span", class_="author")
            if author_el:
                author = self._clean_text(author_el.get_text())

            # Category dari URL
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
            self.logger.error(f"Error parse CNN {url}: {e}")
            return None

    def _extract_category(self, url: str) -> str:
        category_map = {
            "nasional": "nasional",
            "ekonomi": "ekonomi",
            "internasional": "internasional",
            "teknologi": "teknologi",
            "olahraga": "olahraga",
            "hiburan": "hiburan",
            "gaya-hidup": "gaya hidup",
            "politik": "politik",
        }
        for key, val in category_map.items():
            if f"/{key}/" in url:
                return val
        return "umum"

    def _parse_date(self, date_text: str) -> Optional[datetime]:
        if not date_text:
            return None
        try:
            date_text = date_text.strip()
            # CNN: "Senin, 15 Jan 2024 10:00 WIB"
            day_names = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
            for day in day_names:
                date_text = date_text.replace(f"{day}, ", "")
            date_text = date_text.replace(" WIB", "").replace(" WITA", "").replace(" WIT", "")

            month_map = {
                "Jan": "Jan", "Feb": "Feb", "Mar": "Mar", "Apr": "Apr",
                "Mei": "May", "Jun": "Jun", "Jul": "Jul", "Agu": "Aug",
                "Sep": "Sep", "Okt": "Oct", "Nov": "Nov", "Des": "Dec",
            }
            for ind, eng in month_map.items():
                date_text = date_text.replace(f" {ind} ", f" {eng} ")

            return dateparser.parse(date_text, dayfirst=True)
        except Exception:
            return None
