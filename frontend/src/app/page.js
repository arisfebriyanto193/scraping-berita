"use client";

import { useState, useRef } from 'react';
import { Search, Sparkles, Filter, Calendar, ExternalLink, X, Newspaper, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { searchRealtime } from '@/services/api';

// ── Modal Backdrop ─────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--surface-border)',
          borderRadius: '20px 20px 0 0',
          width: '100%',
          maxWidth: '600px',
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: '1.5rem',
          animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Drag handle */}
        <div style={{ width: '40px', height: '4px', borderRadius: '99px', background: 'rgba(255,255,255,0.2)', margin: '0 auto 1.25rem' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%',
              width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'white',
            }}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function RealtimeSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingSource, setLoadingSource] = useState(null);
  const [activeSource, setActiveSource] = useState(null);
  const [searchTime, setSearchTime] = useState(0);
  const [totalResults, setTotalResults] = useState(0);

  // Progress overlay state
  const [progress, setProgress] = useState({ percent: 0, message: '', logs: [] });
  const abortRef = useRef(null);

  // Modal states
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    sources: [],
    date_preset: '',
    date_from: '',
    date_to: '',
  });

  const cancelSearch = () => {
    if (abortRef.current) abortRef.current.abort();
  };

  const TOPICS = ['Ekonomi', 'Nasional', 'Olahraga', 'Teknologi', 'Hiburan', 'Gaya Hidup', 'Otomotif', 'Kesehatan', 'Pendidikan', 'Opini', 'Politik'];

  const PLATFORMS = ['detik', 'kompas', 'cnn', 'republika', 'tribun', 'antara', 'liputan6', 'sindo', 'cnbcindonesia', 'okezone'];
  const DATE_PRESETS = [
    { value: '', label: 'All Time' },
    { value: 'today', label: 'Hari Ini' },
    { value: 'last_7_days', label: '7 Hari Terakhir' },
    { value: 'this_month', label: 'Bulan Ini' },
    { value: 'this_year', label: 'Tahun Ini' },
  ];

  const runSearch = async ({ q, filters: activeFilters }) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setResults([]);
    setProgress({ percent: 0, message: 'Memulai pencarian...', logs: [] });

    try {
      const res = await searchRealtime({
        query: q,
        filters: activeFilters,
        top_k: 10,
        signal: controller.signal,
        onProgress: (event) => {
          if (event.type === 'progress' || event.type === 'embedding') {
            setProgress(prev => ({
              percent: event.percent ?? prev.percent,
              message: event.message || prev.message,
              logs: event.message
                ? [...prev.logs.slice(-9), event.message]
                : prev.logs,
            }));
          }
        },
      });
      const sorted = (res.results || []).sort((a, b) => (a.distance ?? 1) - (b.distance ?? 1));
      setResults(sorted);
      setSearchTime(res.query_time || 0);
      setTotalResults(res.total || 0);
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Search dibatalkan oleh user.');
      } else {
        console.error('Search Error:', error);
        alert(error.message);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleSearch = async (e, customQuery = null) => {
    if (e) e.preventDefault();
    const q = customQuery !== null ? customQuery : query;
    if (!q.trim()) return;
    const activeFilters = {};
    if (filters.sources.length > 0) activeFilters.sources = filters.sources;
    if (filters.date_preset) activeFilters.date_preset = filters.date_preset;
    if (filters.date_from) activeFilters.date_from = filters.date_from;
    if (filters.date_to) activeFilters.date_to = filters.date_to;
    await runSearch({ q, filters: activeFilters });
  };

  const handleTopicClick = (topic) => {
    setQuery(topic);
    handleSearch(null, topic);
  };

  const toggleSource = (source) => {
    setFilters(prev => {
      const sources = prev.sources.includes(source)
        ? prev.sources.filter(s => s !== source)
        : [...prev.sources, source];
      return { ...prev, sources };
    });
  };

  const handleQuickSource = async (source) => {
    setShowSourceModal(false);
    setActiveSource(source);
    setResults([]);
    setSearchTime(0);
    setTotalResults(0);
    const activeFilters = { sources: [source] };
    if (filters.date_preset) activeFilters.date_preset = filters.date_preset;
    if (filters.date_from) activeFilters.date_from = filters.date_from;
    if (filters.date_to) activeFilters.date_to = filters.date_to;
    await runSearch({ q: '', filters: activeFilters });
    setLoadingSource(null);
  };

  const hasActiveFilters = filters.sources.length > 0 || filters.date_preset || filters.date_from || filters.date_to;

  return (
    <div className="container animate-fade-in">

      {/* ── Blocking Progress Overlay ─────────────────────────────────────── */}
      {loading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(5, 5, 15, 0.92)',
          backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: '1.5rem',
          padding: '2rem',
          animation: 'fadeIn 0.25s ease',
        }}>
          {/* Icon & Title */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1rem', boxShadow: '0 0 32px rgba(99,102,241,0.5)',
            }}>
              <Sparkles size={24} color="white" />
            </div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'white' }}>
              Sedang Mencari Berita
            </h2>
            <p style={{ margin: '0.4rem 0 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem' }}>
              {progress.message || 'Memulai pencarian...'}
            </p>
          </div>

          {/* Progress Bar */}
          <div style={{ width: '100%', maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>Progress</span>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#a5b4fc' }}>
                {progress.percent}%
              </span>
            </div>
            <div style={{
              height: '10px', borderRadius: '99px',
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: '99px',
                width: `${progress.percent}%`,
                background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7)',
                transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)',
                boxShadow: '0 0 12px rgba(139,92,246,0.7)',
              }} />
            </div>
          </div>

          {/* Scraper Logs */}
          <div style={{
            width: '100%', maxWidth: '480px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px', padding: '0.75rem 1rem',
            maxHeight: '180px', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: '4px',
          }}>
            {progress.logs.length === 0
              ? <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>Menunggu scraper...</span>
              : progress.logs.map((log, i) => (
                <div key={i} style={{
                  fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)',
                  padding: '2px 0', borderBottom: i < progress.logs.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}>
                  {log}
                </div>
              ))
            }
          </div>

          {/* Cancel Button */}
          <button
            onClick={cancelSearch}
            style={{
              padding: '10px 28px', borderRadius: '10px', cursor: 'pointer',
              border: '1px solid rgba(239,68,68,0.5)',
              background: 'rgba(239,68,68,0.1)',
              color: '#fca5a5', fontSize: '0.9rem', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            <X size={15} /> Batalkan Pencarian
          </button>

          <style>{`
            @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
          `}</style>
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}

      {/* Modal: Berita Terbaru (Platform Picker) */}
      <Modal open={showSourceModal} onClose={() => setShowSourceModal(false)} title="📰 Pilih Platform Berita">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Klik platform untuk langsung melihat 10 berita terbaru.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {PLATFORMS.map(p => {
            const isActive = activeSource === p && !query;
            const isLoading = loadingSource === p;
            return (
              <button
                key={`modal-${p}`}
                type="button"
                disabled={loadingSource !== null}
                onClick={() => handleQuickSource(p)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: '10px', padding: '12px 14px', borderRadius: '12px', cursor: 'pointer',
                  border: `1px solid ${isActive ? 'var(--primary)' : 'var(--surface-border)'}`,
                  background: isActive ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                  color: 'white', fontSize: '0.9rem', fontWeight: 500, textTransform: 'capitalize',
                  transition: 'all 0.2s', opacity: loadingSource && !isLoading ? 0.5 : 1,
                }}
              >
                <span>{p}</span>
                {isLoading
                  ? <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                  : <ChevronRight size={14} style={{ opacity: 0.5 }} />
                }
              </button>
            );
          })}
        </div>
      </Modal>

      {/* Modal: Filter */}
      <Modal open={showFilterModal} onClose={() => setShowFilterModal(false)} title="⚙️ Filter Pencarian">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Sumber Berita */}
          <div>
            <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Sumber Berita
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORMS.map(p => (
                <button
                  key={`filter-src-${p}`}
                  type="button"
                  onClick={() => toggleSource(p)}
                  style={{
                    padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                    border: `1px solid ${filters.sources.includes(p) ? 'var(--primary)' : 'var(--surface-border)'}`,
                    background: filters.sources.includes(p) ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                    color: 'white', fontSize: '0.875rem', fontWeight: 500, textTransform: 'capitalize',
                    transition: 'all 0.2s',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            {filters.sources.length > 0 && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--primary)' }}>
                ✓ {filters.sources.length} sumber dipilih
              </p>
            )}
          </div>

          {/* Rentang Tanggal */}
          <div>
            <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Rentang Tanggal
            </h4>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Dari</label>
                <input
                  type="date"
                  className="input-glass w-full"
                  style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                  value={filters.date_from}
                  onChange={(e) => setFilters({ ...filters, date_from: e.target.value, date_preset: '' })}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Sampai</label>
                <input
                  type="date"
                  className="input-glass w-full"
                  style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                  value={filters.date_to}
                  onChange={(e) => setFilters({ ...filters, date_to: e.target.value, date_preset: '' })}
                />
              </div>
            </div>
          </div>

          {/* Preset Waktu */}
          <div>
            <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Preset Waktu
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {DATE_PRESETS.map(d => {
                const isSelected = filters.date_preset === d.value && !filters.date_from && !filters.date_to;
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setFilters({ ...filters, date_preset: d.value, date_from: '', date_to: '' })}
                    style={{
                      padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                      border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--surface-border)'}`,
                      background: isSelected ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                      color: 'white', fontSize: '0.875rem', fontWeight: isSelected ? 600 : 400,
                      transition: 'all 0.2s',
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setFilters({ sources: [], date_preset: '', date_from: '', date_to: '' })}
              style={{
                flex: 1, padding: '12px', borderRadius: '10px', cursor: 'pointer',
                border: '1px solid var(--surface-border)', background: 'rgba(255,255,255,0.04)',
                color: 'var(--text-muted)', fontSize: '0.9rem',
              }}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setShowFilterModal(false)}
              style={{
                flex: 2, padding: '12px', borderRadius: '10px', cursor: 'pointer',
                border: 'none', background: 'var(--primary)',
                color: 'white', fontSize: '0.9rem', fontWeight: 600,
              }}
            >
              Terapkan Filter
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Hero Search ───────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', margin: '4rem 0 3rem' }}>
        <h1 className="text-gradient" style={{ fontSize: '3rem', marginBottom: '1rem' }}>
          Realtime Search
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginBottom: '2rem' }}>
          Live News Scraping & Sentence Embedding
        </p>

        <form onSubmit={handleSearch} style={{ maxWidth: '800px', margin: '0 auto' }}>
          {/* Search Bar */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'stretch' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
              <input
                type="text"
                className="input-glass w-full"
                style={{ paddingLeft: '2.75rem', paddingRight: '1rem', height: '48px', fontSize: '1rem' }}
                placeholder="Cari berita terkini berdasarkan makna..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ height: '48px', padding: '0 1.25rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {loading ? <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div> : <><Sparkles size={16} /> Cari</>}
            </button>
          </div>

          {/* Quick Topics */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', marginTop: '1.2rem' }}>
            {TOPICS.map(topic => (
              <button
                key={topic}
                type="button"
                className="btn-glass hover-primary"
                style={{ fontSize: '0.8rem', padding: '4px 12px', borderRadius: '99px', transition: 'all 0.2s', cursor: 'pointer' }}
                onClick={() => handleTopicClick(topic)}
              >
                #{topic}
              </button>
            ))}
          </div>

          {/* Action Buttons: Berita Terbaru + Filter */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
            {/* Berita Terbaru Button */}
            <button
              type="button"
              onClick={() => setShowSourceModal(true)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px', borderRadius: '12px', cursor: 'pointer',
                border: `1px solid ${activeSource ? 'var(--primary)' : 'var(--surface-border)'}`,
                background: activeSource ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.06)',
                color: 'white', fontSize: '0.9rem', fontWeight: 500, transition: 'all 0.2s',
              }}
            >
              {loadingSource
                ? <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                : <Newspaper size={16} />
              }
              <span>
                {loadingSource
                  ? `Memuat ${loadingSource}...`
                  : activeSource
                    ? `Berita: ${activeSource}`
                    : 'Berita Terbaru'}
              </span>
            </button>

            {/* Filter Button */}
            <button
              type="button"
              onClick={() => setShowFilterModal(true)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px', borderRadius: '12px', cursor: 'pointer',
                border: `1px solid ${hasActiveFilters ? 'var(--primary)' : 'var(--surface-border)'}`,
                background: hasActiveFilters ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.06)',
                color: 'white', fontSize: '0.9rem', fontWeight: 500, transition: 'all 0.2s',
              }}
            >
              <Filter size={16} />
              <span>
                Filter{hasActiveFilters ? ` (${(filters.sources.length > 0 ? filters.sources.length : 0) + (filters.date_preset || filters.date_from ? 1 : 0)} aktif)` : ''}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {searchTime > 0 && (
        <div style={{ marginBottom: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Ditemukan {totalResults} hasil dalam {searchTime.toFixed(3)} detik
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: '1.5rem' }}
           className="grid-responsive">
        {results.map((article, idx) => (
          <div
            key={`${article.id || article.url}-${idx}`}
            className="glass-card"
            style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            {/* Top: source badge + score */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{
                background: 'rgba(255,255,255,0.1)',
                padding: '3px 8px', borderRadius: '4px',
                fontSize: '0.75rem', textTransform: 'uppercase',
                letterSpacing: '1px', fontWeight: 600,
              }}>
                {article.source}
              </span>
              {article.distance !== undefined && (
                <div className="score-badge" title="Sentence Embedding Score: mendekati 0 = paling relevan">
                  <Sparkles size={12} />
                  Score: {article.distance.toFixed(4)}
                </div>
              )}
            </div>

            {/* Title */}
            <h3 style={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.4, margin: 0 }}>
              <a href={article.url} target="_blank" rel="noopener noreferrer"
                style={{ color: 'white', textDecoration: 'none' }}>
                {article.title}
              </a>
            </h3>

            {/* Excerpt */}
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.6, margin: 0, flexGrow: 1 }}>
              {article.content ? article.content.substring(0, 130) + '...' : ''}
            </p>

            {/* Footer: date + read */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--surface-border)', marginTop: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                <Calendar size={13} />
                {article.published_date ? format(new Date(article.published_date), 'dd MMM yyyy') : 'Unknown'}
              </div>
              <a href={article.url} target="_blank" rel="noopener noreferrer"
                className="nav-link"
                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                Baca <ExternalLink size={13} />
              </a>
            </div>
          </div>
        ))}
      </div>

      {results.length === 0 && searchTime > 0 && (
        <div className="text-center" style={{ padding: '4rem 0', color: 'var(--text-muted)' }}>
          <h3>Tidak ada berita yang relevan ditemukan.</h3>
          <p>Coba gunakan kata kunci lain.</p>
        </div>
      )}
    </div>
  );
}
