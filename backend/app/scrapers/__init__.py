"""Scrapers package - berisi semua scraper per platform"""
from app.scrapers.detik import DetikScraper
from app.scrapers.kompas import KompasScraper
from app.scrapers.cnn import CNNScraper
from app.scrapers.tempo import TempoScraper
from app.scrapers.liputan6 import Liputan6Scraper
from app.scrapers.tribun import TribunScraper
from app.scrapers.antara import AntaraScraper
from app.scrapers.sindonews import SindonewsScraper
from app.scrapers.republika import RepublikaScraper
from app.scrapers.jpnn import JPNNScraper

# Registry semua scraper yang tersedia
SCRAPER_REGISTRY = {
    "detik": DetikScraper,
    "kompas": KompasScraper,
    "cnn": CNNScraper,
    "tempo": TempoScraper,
    "liputan6": Liputan6Scraper,
    "tribun": TribunScraper,
    "antara": AntaraScraper,
    "sindonews": SindonewsScraper,
    "republika": RepublikaScraper,
    "jpnn": JPNNScraper,
}

__all__ = [
    "DetikScraper", "KompasScraper", "CNNScraper", "TempoScraper",
    "Liputan6Scraper", "TribunScraper", "AntaraScraper", "SindonewsScraper",
    "RepublikaScraper", "JPNNScraper", "SCRAPER_REGISTRY"
]
