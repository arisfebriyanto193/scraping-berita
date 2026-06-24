# 📰 Universal News Scraper

Scraper berita universal berbasis Python yang bisa bekerja di **portal berita manapun** tanpa konfigurasi khusus per situs. Menggunakan pendekatan heuristik untuk mendeteksi halaman artikel secara otomatis.

---

## ✨ Fitur Utama

- **Universal** — tidak ada whitelist domain, semua URL bisa diproses
- **Heuristik cerdas** — sistem scoring untuk membedakan halaman artikel vs halaman lain
- **Multi-strategi ekstraksi** — mencoba readability → CSS selector → fallback `<p>` tag
- **Metadata lengkap** — judul, penulis, tanggal, kategori, isi artikel, jumlah kata
- **Rate limiting** — jeda antar request untuk menghindari pemblokiran

---

## 🛠 Instalasi

```bash
pip install requests beautifulsoup4 lxml readability-lxml
```

> `readability-lxml` bersifat opsional tapi sangat direkomendasikan untuk kualitas ekstraksi konten yang lebih baik.

---

## ⚙️ Konfigurasi

Edit tiga variabel di bagian atas file `scraper.py`:

```python
# URL halaman sumber berita (homepage, kategori, atau tag)
SUMBER_BERITA = "https://www.detik.com/"

# Berapa banyak artikel yang ingin diambil?
JUMLAH_BERITA = 10

# Jeda antar request (detik) — hindari banned
DELAY_DETIK = 1.0
```

---

## 🚀 Cara Penggunaan

### Jalankan langsung (gunakan konfigurasi di atas)

```bash
python scraper.py
```

### Override via argumen command line

```bash
# Ambil 5 artikel dari Kompas
python scraper.py https://www.kompas.com/ 5

# Ambil 20 artikel dari CNN Indonesia kategori ekonomi
python scraper.py https://www.cnnindonesia.com/ekonomi 20

# Ambil dari halaman tag tertentu
python scraper.py https://www.tempo.co/tag/teknologi 8
```

---

## 🔍 Cara Kerja (Alur Lengkap)

```
┌─────────────────────────────────────────────────────────┐
│  TAHAP 1 — CRAWL LISTING                                │
│                                                         │
│  GET halaman sumber  →  Ekstrak semua <a href>          │
│  Untuk setiap link:                                     │
│    • Hitung skor heuristik (_score_link)                │
│    • Jika skor ≥ 3 → masukkan ke kandidat artikel       │
│  Sort by skor tertinggi → ambil N teratas               │
└──────────────────────┬──────────────────────────────────┘
                       │ daftar URL artikel
┌──────────────────────▼──────────────────────────────────┐
│  TAHAP 2 — SCRAPE ARTIKEL                               │
│                                                         │
│  Untuk setiap URL:                                      │
│    • GET halaman artikel                                │
│    • Parse JSON-LD structured data                      │
│    • Ekstrak: judul, penulis, tanggal, kategori, isi    │
│    • Tunggu DELAY_DETIK sebelum request berikutnya      │
└──────────────────────┬──────────────────────────────────┘
                       │ daftar dict artikel
┌──────────────────────▼──────────────────────────────────┐
│  TAHAP 3 — RINGKASAN                                    │
│                                                         │
│  Cetak tabel ringkasan semua artikel beserta            │
│  judul dan jumlah kata yang berhasil diekstrak          │
└─────────────────────────────────────────────────────────┘
```

Untuk diagram flowchart visual, lihat file `diagram.mermaid` di repositori ini.

---

## 📊 Sistem Scoring Link (`_score_link`)

Setiap link di halaman listing diberi skor heuristik. Link dengan skor **≥ 3** dianggap sebagai artikel.

| Kondisi | Poin |
|---|---|
| Path memiliki ≥ 2 segmen (misal `/ekonomi/berita`) | +1 |
| Path memiliki ≥ 3 segmen | +1 |
| Panjang path > 30 karakter | +1 |
| Panjang path > 60 karakter | +1 |
| Mengandung angka ≥ 4 digit (ID artikel) | +2 |
| Mengandung pola tanggal `/2024/06/` | +2 |
| Mengandung kata kunci artikel (`/berita/`, `/read/`, dsb.) | +2 |
| Segmen terakhir punya ≥ 3 tanda hubung (slug judul) | +2 |
| Anchor text lebih dari 20 karakter | +1 |

Link langsung **dibuang (skor -1)** jika:
- Domain berbeda dari sumber
- Berekstensi media (`.jpg`, `.pdf`, `.mp4`, dsb.)
- Mengandung path navigasi (`/tag/`, `/kategori/`, `/login/`, dsb.)

### Contoh scoring

```
URL: https://www.detik.com/finance/moneter/d-7654321/bi-pertahankan-suku-bunga-acuan-di-6-persen
  - 4 segmen: +2
  - Panjang > 60 char: +2
  - Mengandung angka (7654321): +2
  - Slug "bi-pertahankan-suku-bunga-acuan-di-6-persen" punya 7 tanda hubung: +2
  TOTAL SKOR: 8 ✅ → dikategorikan sebagai artikel

URL: https://www.detik.com/tag/ekonomi
  - Path mengandung /tag/ → BUANG (-1) ✅
```

---

## 📝 Strategi Ekstraksi Konten

Konten artikel diekstrak menggunakan tiga lapisan fallback:

```
1. readability-lxml  →  algoritma "readable" Mozilla
        ↓ (jika gagal atau terlalu pendek)
2. CSS selector generik  →  [itemprop=articleBody], article,
                             [class*=article-body], main, dsb.
        ↓ (jika tidak ada yang cocok)
3. Fallback <p> tag  →  kumpulkan semua paragraf substansial
                         (panjang > 40 karakter), hapus noise
                         (script, nav, footer, dsb.)
```

### Contoh output satu artikel

```
════════════════════════════════════════════════════════
  ARTIKEL 1/10  —  DETIK.COM
════════════════════════════════════════════════════════

📰  JUDUL
    BI Pertahankan Suku Bunga Acuan di 6 Persen

────────────────────────────────────────────────────────
✍  Penulis  : Hendra Kusuma
🗓  Tanggal  : 2025-01-15 14:30:00
🏷  Kategori : Moneter
🔗  URL      : https://www.detik.com/finance/...
⏱  Diambil  : 2025-01-15 15:00:12
────────────────────────────────────────────────────────

📄  ISI ARTIKEL  (412 kata)

    Bank Indonesia (BI) kembali mempertahankan suku bunga
    acuan atau BI Rate di level 6 persen dalam Rapat Dewan
    Gubernur (RDG) bulan ini. Keputusan ini sesuai dengan
    ekspektasi pasar seiring stabilnya kondisi inflasi...

════════════════════════════════════════════════════════
```

---

## 🗂 Struktur Output Data

Setiap artikel menghasilkan satu `dict` Python dengan struktur berikut:

```python
{
    "url":        "https://www.detik.com/...",   # URL artikel
    "domain":     "detik.com",                   # Domain sumber
    "title":      "Judul Artikel",               # Judul berita
    "author":     "Nama Penulis",                # Penulis (jika ada)
    "date":       "2025-01-15 14:30:00",         # Tanggal publikasi
    "category":   "Ekonomi",                     # Kategori/rubrik
    "content":    "Isi artikel...",              # Teks full artikel
    "word_count": 412,                           # Jumlah kata konten
    "scraped_at": "2025-01-15 15:00:12",         # Waktu scraping
}
```

---

## 🌐 Portal yang Telah Diuji

Scraper ini telah diuji dan bekerja dengan baik di portal-portal berikut:

| Portal | URL | Catatan |
|---|---|---|
| Detik | `detik.com` | Stabil, metadata lengkap |
| Kompas | `kompas.com` | Beberapa artikel JS-rendered |
| CNN Indonesia | `cnnindonesia.com` | Stabil |
| Antara | `antaranews.com` | Stabil |
| Liputan6 | `liputan6.com` | Stabil |
| Tribunnews | `tribunnews.com` | Stabil |
| Republika | `republika.co.id` | Stabil |
| CNBC Indonesia | `cnbcindonesia.com` | Tanggal di URL |
| Okezone | `okezone.com` | Tanggal di URL |
| Sindonews | `sindonews.com` | Stabil |

> Portal yang banyak menggunakan JavaScript rendering (seperti sebagian Kompas dan Tempo) mungkin menghasilkan konten yang tidak lengkap karena scraper ini tidak menggunakan headless browser.

---

## ⚠️ Catatan Penting

- Gunakan scraper ini untuk keperluan pribadi, riset, atau edukasi.
- Patuhi `robots.txt` dan syarat penggunaan masing-masing portal.
- Atur `DELAY_DETIK` yang wajar (minimal 1 detik) agar tidak membebani server.
- Beberapa portal menerapkan proteksi anti-bot — jika diblokir, coba tambah delay atau gunakan rotating User-Agent.

---

## 📦 Dependencies

```
requests>=2.28
beautifulsoup4>=4.12
lxml>=4.9
readability-lxml>=0.8   # opsional, sangat direkomendasikan
```