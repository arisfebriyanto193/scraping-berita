"use client";

import { useState } from 'react';
import { Search, Sparkles, Filter, Calendar, ExternalLink, Hash } from 'lucide-react';
import { format } from 'date-fns';
import { searchSemantic, searchHybrid, searchKeyword } from '@/services/api';

export default function Home() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  const [searchMode, setSearchMode] = useState('semantic'); // 'semantic' | 'hybrid' | 'keyword'
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState({
    sources: [],
    date_preset: '',
    date_from: '',
    date_to: '',
  });

  const PLATFORMS = ['detik', 'kompas', 'cnn', 'tempo', 'liputan6', 'tribun', 'antara', 'sindonews', 'republika', 'jpnn'];
  const DATE_PRESETS = [
    { value: '', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: 'last_7_days', label: 'Last 7 Days' },
    { value: 'this_month', label: 'This Month' },
    { value: 'this_year', label: 'This Year' },
  ];

  const MODES = [
    { id: 'semantic', label: 'Semantic', icon: <Sparkles size={14} /> },
    { id: 'hybrid',   label: 'Hybrid',   icon: <Search size={14} /> },
    { id: 'keyword',  label: 'Keyword',  icon: <Hash size={14} /> },
  ];

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setResults([]);

    try {
      const activeFilters = {};
      if (filters.sources.length > 0)  activeFilters.sources     = filters.sources;
      if (filters.date_preset)          activeFilters.date_preset = filters.date_preset;
      if (filters.date_from)            activeFilters.date_from   = filters.date_from;
      if (filters.date_to)              activeFilters.date_to     = filters.date_to;

      let res;
      if (searchMode === 'semantic') {
        res = await searchSemantic({ query, filters: activeFilters, top_k: 20, threshold: 0.3 });
      } else if (searchMode === 'hybrid') {
        res = await searchHybrid({
          query,
          keywords: query.split(' ').filter(w => w.length > 3),
          filters: activeFilters,
        });
      } else {
        // keyword mode — split by space or comma
        const keywords = query.split(/[\s,]+/).filter(Boolean);
        res = await searchKeyword({ keywords, filters: activeFilters });
      }

      const sorted = (res.results || []).sort((a, b) => (a.distance ?? 1) - (b.distance ?? 1));
      setResults(sorted);
      setSearchTime(res.query_time || 0);
      setTotalResults(res.total || sorted.length);
    } catch (error) {
      console.error('Search Error:', error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = (source) => {
    setFilters(prev => {
      const sources = prev.sources.includes(source)
        ? prev.sources.filter(s => s !== source)
        : [...prev.sources, source];
      return { ...prev, sources };
    });
  };

  return (
    <div className="container animate-fade-in">

      {/* ── Hero ── */}
      <div style={{ textAlign: 'center', margin: '3rem 0 2.5rem' }}>
        <h1 className="text-gradient" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', marginBottom: '0.75rem' }}>
          Semantic Search
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)', marginBottom: '2rem' }}>
          Sentence Embedding · AI-Powered News Search
        </p>

        {/* ── Search Form ── */}
        <form onSubmit={handleSearch} style={{ maxWidth: '760px', margin: '0 auto' }}>

          {/* Input + Submit */}
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search
                style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
                size={18}
              />
              <input
                type="text"
                className="input-glass w-full"
                style={{ paddingLeft: '2.6rem', paddingRight: '1rem', height: '44px', fontSize: '1rem' }}
                placeholder={
                  searchMode === 'keyword'
                    ? 'Masukkan kata kunci, pisahkan dengan spasi...'
                    : 'Cari berita berdasarkan makna / kalimat...'
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ height: '44px', padding: '0 1.1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {loading
                ? <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                : <><Sparkles size={15} /> Search</>
              }
            </button>
          </div>

          {/* Mode tabs + Filter toggle */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1rem' }}>
            {/* Mode pills */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {MODES.map(m => (
                <button
                  key={m.id}
                  type="button"
                  className={`btn-glass${searchMode === m.id ? ' active' : ''}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    fontSize: '0.85rem', padding: '5px 14px',
                    background: searchMode === m.id ? 'rgba(99,102,241,0.18)' : '',
                    borderColor: searchMode === m.id ? 'var(--primary)' : '',
                    color: searchMode === m.id ? 'var(--primary)' : '',
                  }}
                  onClick={() => setSearchMode(m.id)}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>

            {/* Filter toggle */}
            <button
              type="button"
              className="btn-glass"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '5px 14px' }}
              onClick={() => setShowFilters(v => !v)}
            >
              <Filter size={15} />
              Filters
              {filters.sources.length > 0 && (
                <span style={{ background: 'var(--primary)', color: 'white', borderRadius: '999px', padding: '0 6px', fontSize: '0.75rem', lineHeight: '1.4' }}>
                  {filters.sources.length}
                </span>
              )}
            </button>
          </div>

          {/* Mode description hint */}
          {searchMode === 'keyword' && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'left' }}>
              💡 Mode Keyword: Masukkan beberapa kata kunci yang dipisah spasi. Artikel yang mengandung kata-kata tersebut akan ditampilkan.
            </p>
          )}
          {searchMode === 'hybrid' && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'left' }}>
              💡 Mode Hybrid: Kombinasi pencarian semantik dan keyword untuk hasil yang lebih akurat.
            </p>
          )}

          {/* ── Filters Panel ── */}
          {showFilters && (
            <div className="glass-panel animate-fade-in" style={{ marginTop: '1rem', padding: '1.25rem', textAlign: 'left' }}>
              <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>

                {/* Source checkboxes */}
                <div>
                  <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Sumber Berita
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {PLATFORMS.map(p => (
                      <button
                        key={p}
                        type="button"
                        className="btn-glass"
                        style={{
                          fontSize: '0.8rem', padding: '3px 10px', textTransform: 'capitalize',
                          background: filters.sources.includes(p) ? 'var(--primary)' : '',
                          borderColor: filters.sources.includes(p) ? 'var(--primary)' : '',
                          color: filters.sources.includes(p) ? 'white' : '',
                        }}
                        onClick={() => toggleSource(p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date filters */}
                <div>
                  <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Rentang Tanggal
                  </h4>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '120px' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Dari</label>
                      <input
                        type="date"
                        className="input-glass w-full"
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                        value={filters.date_from}
                        onChange={(e) => setFilters(f => ({ ...f, date_from: e.target.value, date_preset: '' }))}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: '120px' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Sampai</label>
                      <input
                        type="date"
                        className="input-glass w-full"
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                        value={filters.date_to}
                        onChange={(e) => setFilters(f => ({ ...f, date_to: e.target.value, date_preset: '' }))}
                      />
                    </div>
                  </div>

                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Atau preset cepat:</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
                    {DATE_PRESETS.map(d => (
                      <label
                        key={d.value}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '0.83rem' }}
                      >
                        <input
                          type="radio"
                          name="date_preset"
                          checked={filters.date_preset === d.value && !filters.date_from && !filters.date_to}
                          onChange={() => setFilters(f => ({ ...f, date_preset: d.value, date_from: '', date_to: '' }))}
                          style={{ accentColor: 'var(--primary)' }}
                        />
                        {d.label}
                      </label>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="btn-glass"
                    style={{ fontSize: '0.8rem', padding: '4px 12px' }}
                    onClick={() => setFilters({ sources: [], date_preset: '', date_from: '', date_to: '' })}
                  >
                    Reset Filter
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* ── Result Info ── */}
      {searchTime > 0 && (
        <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Ditemukan <strong style={{ color: 'var(--text-main)' }}>{totalResults}</strong> hasil dalam {searchTime.toFixed(3)} detik
        </p>
      )}

      {/* ── Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: '1.25rem' }} className="grid-responsive">
        {results.map((article, idx) => (
          <div
            key={`${article.id || article.url}-${idx}`}
            className="glass-card"
            style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}
          >
            {/* Badge row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{
                background: 'rgba(255,255,255,0.08)',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: 700,
              }}>
                {article.source}
              </span>

              {/* Score display — show similarity % + distance */}
              {(article.similarity_score !== undefined || article.distance !== undefined) && (() => {
                const sim   = article.similarity_score ?? (1 - (article.distance ?? 1));
                const dist  = article.distance        ?? (1 - sim);
                const pct   = Math.round(sim * 100);
                // colour gradient: green (high sim) → yellow → red (low sim)
                const hue   = Math.round(sim * 120); // 0=red, 120=green
                const color = `hsl(${hue}, 70%, 60%)`;
                return (
                  <div title={`Similarity: ${(sim * 100).toFixed(1)}%  |  Distance: ${dist.toFixed(4)}\nMendekati 100% = paling relevan`}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* bar */}
                    <div style={{ width: '48px', height: '5px', borderRadius: '99px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '99px', transition: 'width 0.4s' }} />
                    </div>
                    {/* numeric */}
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color, whiteSpace: 'nowrap' }}>
                      {pct}%
                    </span>
                    <Sparkles size={11} style={{ color, flexShrink: 0 }} />
                  </div>
                );
              })()}

            {/* Title */}
            <h3 style={{ fontSize: '0.97rem', fontWeight: 600, lineHeight: 1.45, margin: 0 }}>
              <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'none' }}>
                {article.title}
              </a>
            </h3>

            {/* Excerpt */}
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6, margin: 0, flexGrow: 1 }}>
              {article.content ? article.content.substring(0, 140) + '…' : ''}
            </p>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.6rem', borderTop: '1px solid var(--surface-border)', marginTop: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                <Calendar size={12} />
                {article.published_date ? format(new Date(article.published_date), 'dd MMM yyyy') : 'Unknown'}
              </div>
              <a href={article.url} target="_blank" rel="noopener noreferrer" className="nav-link" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}>
                Read <ExternalLink size={12} />
              </a>
            </div>
          </div>
        ))}
      </div>

      {results.length === 0 && searchTime > 0 && (
        <div className="text-center" style={{ padding: '4rem 0', color: 'var(--text-muted)' }}>
          <h3>Tidak ada artikel yang ditemukan.</h3>
          <p style={{ marginTop: '0.5rem' }}>
            {searchMode === 'keyword'
              ? 'Coba kata kunci yang berbeda.'
              : 'Coba ubah kalimat pencarian atau mode pencarian.'}
          </p>
        </div>
      )}
    </div>
  );
}
