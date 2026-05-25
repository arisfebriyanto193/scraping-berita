"""
Tribunnews.com Scraper
Website: https://www.tribunnews.com
"""
import logging
from datetime import datetime
from typing import List, Optional

from bs4 import BeautifulSoup
from dateutil import parser as dateparser

from app.scrapers.base import BaseScraper, ArticleData
from app.config import settings

logger = logging.getLogger(__name__)


class TribunScraper(BaseScraper):
    """Scraper untuk Tribunnews.com"""

    SOURCE_NAME = "tribun"
    BASE_URL = settings.TRIBUN_BASE_URL

    SECTIONS = [
        f"{settings.TRIBUN_BASE_URL}/nasional",
        f"{settings.TRIBUN_BASE_URL}/bisnis-dan-keuangan",
        f"{settings.TRIBUN_BASE_URL}/superskor",
        f"{settings.TRIBUN_BASE_URL}/techno",
        f"{settings.TRIBUN_BASE_URL}/parapuan",
    ]

    def scrape_latest(self, max_articles: int = 20) -> List[ArticleData]:
        articles = []
        urls_seen = set()

        for section_url in self.SECTIONS:
            if len(articles) >= max_articles:
                break
            self.logger.info(f"Scraping Tribun: {section_url}")
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
                    self.logger.info(f"✅ Tribun: {article.title[:60]}")

        self.logger.info(f"Total scraped dari Tribun: {len(articles)} artikel")
        return articles

    def _extract_article_links(self, soup: BeautifulSoup) -> List[str]:
        links = []
        for tag in soup.find_all("a", href=True):
            href = tag["href"]
            if (
                "tribunnews.com" in href
                and href.startswith("http")
                and len(href) > 40
            ):
                # Filter out non-article pages
                if any(skip in href for skip in ["/tag/", "/author/", "?page="]):
                    continue
                links.append(href.split("?")[0])
        return list(dict.fromkeys(links))

    def parse_article(self, url: str) -> Optional[ArticleData]:
        soup = self._fetch(url)
        if not soup:
            return None

        try:
            # Title
            title = ""
            title_el = soup.find("h1", id="arttitle") or soup.find("h1")
            if title_el:
                title = self._clean_text(title_el.get_text())

            # Content - Tribun pakai div#article-2
            content = ""
            content_el = (
                soup.find("div", {"id": "article-2"})
                or soup.find("div", class_="side-article txt-article")
                or soup.find("article")
            )
            if content_el:
                for tag in content_el.find_all(["script", "style", "aside"]):
                    tag.decompose()
                content = self._clean_text(content_el.get_text(separator=" "))

            # Date
            published_date = None
            date_el = (
                soup.find("time")
                or soup.find("span", class_="time")
                or soup.find("div", class_="time")
            )
            if date_el:
                date_str = date_el.get("datetime") or date_el.get_text()
                published_date = self._parse_date(date_str)

            # Author
            author = None
            author_el = soup.find("div", class_="reporter") or soup.find("span", class_="reporter")
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
            self.logger.error(f"Error parse Tribun {url}: {e}")
            return None

    def _extract_category(self, url: str) -> str:
        category_map = {
            "nasional": "nasional",
            "bisnis-dan-keuangan": "ekonomi",
            "superskor": "olahraga",
            "techno": "teknologi",
            "parapuan": "gaya hidup",
            "regional": "regional",
            "internasional": "internasional",
            "seleb": "hiburan",
        }
        for key, val in category_map.items():
            if f"/{key}/" in url or url.endswith(f"/{key}"):
                return val
        return "umum"

    def _parse_date(self, date_text: str) -> Optional[datetime]:
        if not date_text:
            return None
        try:
            date_text = date_text.strip()
            day_names = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
            for day in day_names:
                date_text = date_text.replace(f"{day}, ", "")
            date_text = date_text.replace(" WIB", "").replace(" WITA", "").replace(" WIT", "")
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
