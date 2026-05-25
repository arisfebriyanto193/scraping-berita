-- ============================================================
-- SCHEMA DATABASE - Sistem Pencarian Berita Semantik
-- ============================================================
-- Jalankan script ini di MySQL untuk membuat struktur database

-- Buat database jika belum ada
CREATE DATABASE IF NOT EXISTS news_semantic_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE news_semantic_db;

-- ============================================================
-- TABEL UTAMA: news
-- ============================================================
CREATE TABLE IF NOT EXISTS news (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(500) NOT NULL COMMENT 'Judul berita',
    content TEXT NOT NULL COMMENT 'Konten/isi berita',
    url VARCHAR(1000) UNIQUE NOT NULL COMMENT 'URL artikel asli',
    source VARCHAR(100) NOT NULL COMMENT 'Sumber platform (detik, kompas, dll)',
    published_date DATETIME COMMENT 'Tanggal publikasi artikel',
    category VARCHAR(100) COMMENT 'Kategori berita',
    author VARCHAR(200) COMMENT 'Penulis artikel',
    image_url VARCHAR(1000) COMMENT 'URL gambar utama artikel',
    scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'Waktu artikel di-scrape',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Waktu update terakhir',
    
    -- Indeks untuk performa query
    INDEX idx_source (source),
    INDEX idx_category (category),
    INDEX idx_published_date (published_date),
    INDEX idx_scraped_at (scraped_at),
    
    -- Full-text search index
    FULLTEXT INDEX idx_fulltext_search (title, content)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tabel penyimpanan artikel berita yang telah di-scrape';

-- ============================================================
-- TABEL TRACKING: scraping_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS scraping_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source VARCHAR(100) NOT NULL COMMENT 'Platform yang di-scrape',
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'Waktu mulai scraping',
    finished_at DATETIME COMMENT 'Waktu selesai scraping',
    articles_scraped INT DEFAULT 0 COMMENT 'Jumlah artikel berhasil',
    articles_failed INT DEFAULT 0 COMMENT 'Jumlah artikel gagal',
    status ENUM('running', 'success', 'failed', 'partial') DEFAULT 'running',
    error_message TEXT COMMENT 'Pesan error jika ada',
    
    INDEX idx_source_status (source, status),
    INDEX idx_started_at (started_at)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Log aktivitas scraping per platform';

-- ============================================================
-- TABEL TRACKING: search_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS search_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    search_type ENUM('semantic', 'keyword', 'hybrid', 'filter') NOT NULL,
    query TEXT COMMENT 'Query yang dimasukkan user',
    filters JSON COMMENT 'Filter yang diterapkan',
    results_count INT DEFAULT 0 COMMENT 'Jumlah hasil yang ditemukan',
    query_time_ms FLOAT COMMENT 'Waktu pencarian dalam milidetik',
    searched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_search_type (search_type),
    INDEX idx_searched_at (searched_at)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Log aktivitas pencarian';

-- ============================================================
-- VIEW: article_stats
-- ============================================================
CREATE OR REPLACE VIEW article_stats AS
SELECT 
    source,
    COUNT(*) as total_articles,
    MIN(published_date) as oldest_article,
    MAX(published_date) as newest_article,
    MAX(scraped_at) as last_scraped
FROM news
GROUP BY source;

-- ============================================================
-- STORED PROCEDURE: cleanup_old_articles
-- ============================================================
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS cleanup_old_articles(IN days_to_keep INT)
BEGIN
    DELETE FROM news 
    WHERE scraped_at < DATE_SUB(NOW(), INTERVAL days_to_keep DAY);
    
    SELECT ROW_COUNT() as deleted_count;
END //
DELIMITER ;

-- ============================================================
-- SAMPLE DATA (untuk testing)
-- ============================================================
-- Uncomment baris di bawah untuk insert sample data
/*
INSERT INTO news (title, content, url, source, published_date, category, author, image_url) VALUES
('Kebakaran Hutan di Kalimantan Tengah Meluas', 
 'Kebakaran hutan di Kalimantan Tengah semakin meluas akibat musim kemarau panjang. Ribuan hektar lahan terbakar dan kabut asap mulai menyelimuti beberapa kota di sekitarnya.',
 'https://www.detik.com/news/kebakaran-hutan-kalimantan-tengah',
 'detik', '2024-01-15 10:00:00', 'lingkungan', 'Reporter Detik', 'https://example.com/image1.jpg'),

('Pemerintah Targetkan Inflasi 3% di 2024', 
 'Pemerintah Indonesia menetapkan target inflasi sebesar 3% plus minus 1% untuk tahun 2024. Bank Indonesia akan terus menjaga stabilitas harga.',
 'https://www.kompas.com/ekonomi/inflasi-target-2024',
 'kompas', '2024-01-15 09:00:00', 'ekonomi', 'Reporter Kompas', 'https://example.com/image2.jpg');
*/

-- ============================================================
-- INFORMASI DATABASE
-- ============================================================
SELECT 'Database news_semantic_db berhasil dibuat!' as status;
SELECT TABLE_NAME, TABLE_ROWS, CREATE_TIME 
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'news_semantic_db';
