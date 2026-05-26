# Cara Kerja: Sistem Pencarian Berita Berbasis Semantic Search Menggunakan Web Scraping dan Sentence Embedding

Dokumen ini menjelaskan alur kerja dari keseluruhan sistem, dari mulai pengambilan data berita (Web Scraping) hingga ke pencarian pintar berdasarkan makna bahasa (Semantic Search + Sentence Embedding). Sistem ini dibangun agar selaras 100% dengan judul arsitektur Anda.

---

## 1. Fase Pengumpulan Data (Web Scraping)
Sistem memiliki mekanisme untuk mengambil data dari 10 platform berita terkemuka di Indonesia (Detik, Kompas, CNN, dsb) secara paralel dan otomatis.

**Alur Kerja Scraping:**
1. **Trigger (Pemicu):** Scraping bisa dipicu secara manual melalui API `POST /api/scrape/manual`, atau dibiarkan berjalan otomatis di latar belakang setiap 6 jam sekali menggunakan `APScheduler`.
2. **Parallel Processing:** Sistem memanggil 10 class `Scraper` yang berbeda (seperti `DetikScraper`, `KompasScraper`) secara bersamaan menggunakan `ThreadPoolExecutor`.
3. **Mengumpulkan Link:** Masing-masing scraper masuk ke halaman kategori berita (contoh: nasional, ekonomi, olahraga) dan mengekstrak semua URL berita terbaru.
4. **Parsing Data:** Scraper membuka setiap URL tersebut, lalu memisahkan elemen-elemen HTML-nya (menggunakan `BeautifulSoup4`) untuk mengekstrak metadata penting:
   * Judul Berita
   * Isi/Konten Berita penuh
   * Tanggal Publikasi (dikonversi dari format text Indonesia ke standar DateTime MySQL)
   * Kategori, Penulis, & Gambar URL.
5. **Pencegahan Rate Limit & Blokir:** Scraper merotasi *User-Agent* (berpura-pura menjadi browser Chrome, Firefox, dll yang berbeda) dan memberikan *delay acak* (1-3 detik) antar request untuk menghindari blokir dari server berita.
6. **Penyimpanan Database (Deduplication):** Sebelum disimpan ke tabel MySQL (`news`), sistem mengecek URL tersebut. Jika URL sudah ada di database, artikel akan dilewati untuk mencegah data ganda (duplikat).

---

## 2. Fase Representasi Semantik (Sentence Embedding)
Ini adalah tahap kunci yang membedakan pencarian semantik (berdasarkan makna) dari pencarian biasa.

**Alur Kerja Embedding:**
1. **Model NLP:** Sistem menggunakan *Sentence Transformers* dengan model Machine Learning `paraphrase-multilingual-MiniLM-L12-v2`. Model ini memahami lebih dari 50 bahasa, termasuk **Bahasa Indonesia**.
2. **Proses Encoding:** Ketika artikel baru berhasil di-scrape dan masuk MySQL, sistem menggabungkan teks `Judul` (diulang 3x agar bobotnya lebih kuat) + `Konten Berita`.
3. **Pembuatan Vektor:** Teks tersebut dimasukkan ke dalam model ML, yang akan mengubah teks menjadi deretan angka matematika (vektor) sebanyak **384 dimensi**. Angka-angka ini merepresentasikan "makna konteks" dari berita tersebut.
4. **L2 Normalization:** Vektor tersebut dinormalisasi panjangnya, sehingga kemiripan makna nantinya bisa dihitung dengan sangat cepat menggunakan *dot-product* (setara *Cosine Similarity*).
5. **Index Penyimpanan:** Vektor ini disimpan ke dalam index **FAISS (Facebook AI Similarity Search)** agar bisa dicari dengan kecepatan milidetik, bukan disimpan ke MySQL biasa.

---

## 3. Fase Pencarian Pintar (Semantic Search)
Ketika pengguna mencari sesuatu, misalnya dengan query: **"bencana alam kebakaran di pulau kalimantan"**

**Alur Kerja Semantic Search:**
1. **Query Embedding:** Teks query pengguna `"bencana alam kebakaran di pulau kalimantan"` diubah menjadi vektor 384-dimensi oleh model ML yang sama.
2. **FAISS Similarity Search:** Vektor query tersebut ditembakkan ke FAISS Index. FAISS mencari vektor berita mana saja yang jaraknya paling dekat (paling mirip maknanya) dengan query pengguna menggunakan perhitungan aljabar. 
3. **Pemahaman Konteks (Semantic):** Meskipun di dalam artikel beritanya tidak ada kata "bencana alam" atau "kalimantan" (misalnya artikel aslinya hanya menulis "Api menghanguskan hutan di Palangkaraya"), sistem **tetap akan menemukannya** karena "Palangkaraya" dan "Kalimantan", serta "Api" dan "Bencana/Kebakaran" memiliki kedekatan vektor makna (Sentence Embedding) yang tinggi.
4. **Kandidat Hasil:** FAISS mengembalikan misalnya 500 ID artikel yang dirasa mirip maknanya.

---

## 4. Fase Filtering (MySQL + FAISS Hybrid)
Sistem ini tidak hanya melakukan semantic search mentah, tapi juga digabung dengan filter basis data tradisional.

**Alur Kerja Filtering:**
1. 500 ID artikel dari FAISS dikirimkan ke database MySQL.
2. MySQL melakukan filter berdasarkan parameter User (contoh: Hanya tampilkan berita dari platform "Kompas", kategori "Nasional", dan diterbitkan 7 hari terakhir).
3. Setelah difilter, hasilnya diurutkan kembali (Re-rank) berdasarkan **Similarity Score** tertinggi (makna paling akurat).
4. Hasil akhir dikembalikan ke pengguna dalam format JSON (bisa ditampilkan ke frontend web) dengan kecepatan pencarian (Query Time) di bawah 500ms.

---

## 5. Kesimpulan Keselarasan dengan Judul
Judul Anda: **"Sistem Pencarian Berita Berbasis Semantic Search Menggunakan Web Scraping dan Sentence Embedding"**

Berdasarkan arsitektur dan alur kerja di atas:
* **"Web Scraping"**: Sangat Terpenuhi (Terdapat mekanisme orchestrator dan scraper individual yang mengambil data live HTML dari 10 website dengan BeautifulSoup).
* **"Sentence Embedding"**: Sangat Terpenuhi (Terdapat integrasi model Machine Learning `MiniLM-L12-v2` yang berjalan di lokal untuk merubah teks ke 384 Vector Dimension).
* **"Sistem Pencarian Berita Berbasis Semantic Search"**: Sangat Terpenuhi (Pencarian utama tidak bergantung pada pencocokan kata tradisional `LIKE %keyword%`, melainkan mencari makna dengan jarak vektor menggunakan teknologi FAISS).

Sistem ini merepresentasikan **tepat secara harfiah maupun praktis** dari apa yang tertuang di judul Anda.
