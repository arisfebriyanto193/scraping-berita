import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError

# Load environment variables dari .env
load_dotenv()

# Ambil konfigurasi database
MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_PORT = os.getenv("MYSQL_PORT", "3306")
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "news_semantic_db")

# Buat connection string
DATABASE_URL = f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}"

print("="*50)
print("🔍 MENGUJI KONEKSI DATABASE MYSQL")
print("="*50)
print(f"Host     : {MYSQL_HOST}")
print(f"Port     : {MYSQL_PORT}")
print(f"User     : {MYSQL_USER}")
print(f"Database : {MYSQL_DATABASE}")
print("-" * 50)

try:
    print("Mencoba terhubung...")
    # Buat engine SQLAlchemy
    engine = create_engine(DATABASE_URL, connect_args={"connect_timeout": 5})
    
    # Coba buat koneksi
    with engine.connect() as connection:
        print("✅ KONEKSI BERHASIL!")
        print("Aplikasi Anda siap menggunakan database ini.")
        
except OperationalError as e:
    print("❌ KONEKSI GAGAL!")
    print("\nDetail Error:")
    print(str(e))
    print("\nSaran Perbaikan:")
    print("1. Pastikan service MySQL/MariaDB sedang berjalan di Raspberry Pi / Server Anda.")
    print("2. Pastikan username dan password di file .env sudah benar.")
    print("3. Pastikan database bernama 'news_semantic_db' sudah dibuat.")
    print("4. Jika MySQL ada di komputer lain, pastikan user MySQL diizinkan akses dari luar (Remote Access / bind-address).")
except Exception as e:
    print("❌ Terjadi error tidak terduga:")
    print(str(e))
print("="*50)
