"use client";

import { useState } from 'react';
import { Search, Sparkles, Filter, Calendar, ExternalLink, X, Newspaper, ChevronRight, Globe, Zap, Layers } from 'lucide-react';
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

// ── Mode Toggle Component ──────────────────────────────────────────────────
function ModeToggle({ mode, onChange }) {
  const modes = [
    {
      id: 'auto',
      label: 'Multi Portal',
      desc: 'Scrape portal manapun via URL',
      icon: <Globe size={16} />,
    },
    // {
    //   id: 'kurasi',
    //   label: 'Mode Kurasi',
    //   desc: '10 portal berita terkurasi',
    //   icon: <Layers size={16} />,
    // },
  ];

  return (
    <div style={{
      display: 'flex', gap: '0.5rem',
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid var(--surface-border)',
      borderRadius: '12px', padding: '4px',
      marginBottom: '1rem',
    }}>
      {modes.map(m => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '10px 12px', borderRadius: '9px', cursor: 'pointer', border: 'none',
            background: mode === m.id ? 'var(--primary)' : 'transparent',
            color: 'white', fontSize: '0.875rem', fontWeight: mode === m.id ? 600 : 400,
            transition: 'all 0.2s',
          }}
        >
          {m.icon}
          <span>{m.label}</span>
        </button>
      ))}
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

  // Mode: 'auto' | 'kurasi'
  const [mode, setMode] = useState('auto');

  // URL input untuk mode auto (raw text, bisa banyak URL dipisah baris/koma)
  const [urlInput, setUrlInput] = useState('');

  // Modal states
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    date_preset: '',
    date_from: '',
    date_to: '',
  });

  const PLATFORMS = ['detik', 'kompas', 'cnn', 'republika', 'tribun', 'antara', 'liputan6', 'sindo', 'cnbcindonesia', 'okezone'];

  const DATE_PRESETS = [
    { value: '', label: 'All Time' },
    { value: 'today', label: 'Hari Ini' },
    { value: 'last_7_days', label: '7 Hari Terakhir' },
    { value: 'this_month', label: 'Bulan Ini' },
    { value: 'this_year', label: 'Tahun Ini' },
  ];

  /**
   * Parse URL input (bisa dipisah koma, spasi, newline)
   */
  function parseUrls(raw) {
    return raw
      .split(/[\n,]+/)
      .map(u => u.trim())
      .filter(u => {
        try { new URL(u); return true; } catch { return false; }
      });
  }

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!query.trim() && mode === 'auto' && !urlInput.trim()) return;
    if (!query.trim() && mode === 'kurasi') return;

    setLoading(true);
    setResults([]);

    try {
      const custom_urls = mode === 'auto' ? parseUrls(urlInput) : [];

      if (mode === 'auto' && custom_urls.length === 0) {
        alert('Masukkan minimal 1 URL portal berita yang valid.');
        setLoading(false);
        return;
      }

      const activeFilters = {};
      if (filters.date_preset) activeFilters.date_preset = filters.date_preset;
      if (filters.date_from) activeFilters.date_from = filters.date_from;
      if (filters.date_to) activeFilters.date_to = filters.date_to;

      const res = await searchRealtime({
        query,
        filters: activeFilters,
        top_k: 15,
        mode,
        custom_urls,
      });

      const sorted = (res.results || []).sort((a, b) => (a.distance ?? 1) - (b.distance ?? 1));
      setResults(sorted);
      setSearchTime(res.query_time || 0);
      setTotalResults(res.total || 0);
    } catch (error) {
      console.error("Search Error:", error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSource = async (source) => {
    setShowSourceModal(false);
    setLoadingSource(source);
    setActiveSource(source);
    setResults([]);
    setSearchTime(0);
    setTotalResults(0);

    try {
      const activeFilters = {};
      if (filters.date_preset) activeFilters.date_preset = filters.date_preset;
      if (filters.date_from) activeFilters.date_from = filters.date_from;
      if (filters.date_to) activeFilters.date_to = filters.date_to;

      const res = await searchRealtime({
        query: '',
        filters: { ...activeFilters, sources: [source] },
        top_k: 10,
        mode: 'kurasi',
      });
      setResults(res.results || []);
      setSearchTime(res.query_time || 0);
      setTotalResults((res.results || []).length);
    } catch (error) {
      console.error('[QuickSource] Error:', error);
      alert(error.message);
    } finally {
      setLoadingSource(null);
    }
  };

  const hasActiveFilters = filters.date_preset || filters.date_from || filters.date_to;
  const parsedUrls = parseUrls(urlInput);

  return (
    <div className="container animate-fade-in">

      {/* ── Modals ───────────────────────────────────────────────────────── */}

      {/* Modal: Berita Terbaru (Platform Picker) — hanya mode kurasi */}
      <Modal open={showSourceModal} onClose={() => setShowSourceModal(false)} title="📰 Pilih Portal Berita">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Klik portal untuk langsung melihat 10 berita terbaru.
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
              onClick={() => setFilters({ date_preset: '', date_from: '', date_to: '' })}
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
          Live News Scraping &amp; Sentence Embedding
        </p>

        <form onSubmit={handleSearch} style={{ maxWidth: '800px', margin: '0 auto' }}>

          {/* ── Mode Toggle ──────────────────────────────────────────────── */}
          <ModeToggle mode={mode} onChange={(m) => { setMode(m); setResults([]); setSearchTime(0); }} />

          {/* ── URL Input (Mode Auto) ──────────────────────────────────── */}
          {mode === 'auto' && (
            <div style={{ marginBottom: '0.85rem' }}>
              <div style={{ position: 'relative' }}>
                <Globe style={{ position: 'absolute', left: '1rem', top: '14px', color: 'var(--text-muted)', pointerEvents: 'none' }} size={16} />
                <textarea
                  className="input-glass w-full"
                  rows={2}
                  style={{
                    paddingLeft: '2.75rem', paddingRight: '1rem', paddingTop: '0.75rem', paddingBottom: '0.75rem',
                    fontSize: '0.9rem', resize: 'none', lineHeight: 1.5,
                    fontFamily: 'inherit',
                  }}
                  placeholder="URL portal berita (pisah dengan koma atau baris baru)&#10;Contoh: https://tempo.co, https://mediaindonesia.com"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                />
              </div>
              {parsedUrls.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                  {parsedUrls.map((u, i) => (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.4)',
                      borderRadius: '99px', padding: '2px 10px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)',
                    }}>
                      <Globe size={11} />
                      {(() => { try { return new URL(u).hostname.replace('www.', ''); } catch { return u; } })()}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Search Bar ──────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'stretch' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
              <input
                type="text"
                className="input-glass w-full"
                style={{ paddingLeft: '2.75rem', paddingRight: '1rem', height: '48px', fontSize: '1rem' }}
                placeholder={mode === 'auto'
                  ? 'Kata kunci pencarian (opsional)...'
                  : 'Cari berita terkini berdasarkan makna...'}
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

          {/* ── Action Buttons ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>

            {/* Berita Terbaru — hanya tampil di mode kurasi */}
            {mode === 'kurasi' && (
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
            )}

            {/* Info banner mode auto */}
            {mode === 'auto' && (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
                padding: '12px', borderRadius: '12px',
                border: '1px solid rgba(99,102,241,0.3)',
                background: 'rgba(99,102,241,0.08)',
                color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem',
              }}>
                <Zap size={15} style={{ color: '#818cf8', flexShrink: 0 }} />
                <span>Masukkan URL portal berita di atas, sistem akan otomatis mengekstrak artikel.</span>
              </div>
            )}

            {/* Filter Button */}
            <button
              type="button"
              onClick={() => setShowFilterModal(true)}
              style={{
                flex: mode === 'auto' ? '0 0 auto' : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px 18px', borderRadius: '12px', cursor: 'pointer',
                border: `1px solid ${hasActiveFilters ? 'var(--primary)' : 'var(--surface-border)'}`,
                background: hasActiveFilters ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.06)',
                color: 'white', fontSize: '0.9rem', fontWeight: 500, transition: 'all 0.2s',
              }}
            >
              <Filter size={16} />
              <span>Filter{hasActiveFilters ? ` (${(filters.date_preset || filters.date_from ? 1 : 0)} aktif)` : ''}</span>
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
              {article.distance != null && (() => {
                const dist = Number(article.raw_distance ?? 1);
                const d = Number(article.distance);
                return (
                  <div
                    className="score-badge"
                    title={`Semantic Distance\nRaw distance: ${dist.toFixed(4)}\nRank score: ${d.toFixed(4)} (0=terbaik dalam batch)`}
                  >
                    <Sparkles size={12} />
                    {dist.toFixed(3)}
                  </div>
                );
              })()}
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
                {article.published_date && !isNaN(new Date(article.published_date).getTime()) 
                  ? format(new Date(article.published_date), 'dd MMM yyyy') 
                  : 'Unknown'}
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
          <p>Coba gunakan kata kunci lain atau periksa URL portal yang dimasukkan.</p>
        </div>
      )}
    </div>
  );
}
