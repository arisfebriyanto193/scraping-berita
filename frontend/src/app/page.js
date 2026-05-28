"use client";

import { useState } from 'react';
import { Search, Sparkles, Filter, Calendar, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { searchRealtime } from '@/services/api';

export default function RealtimeSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingSource, setLoadingSource] = useState(null); // track which quick-source is loading
  const [activeSource, setActiveSource] = useState(null);   // highlight active quick-source
  const [searchTime, setSearchTime] = useState(0);
  const [totalResults, setTotalResults] = useState(0);

  // Search Settings
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    sources: [],
    date_preset: '',
    date_from: '',
    date_to: '',
  });

  const TOPICS = ['Ekonomi', 'Nasional', 'Olahraga', 'Teknologi', 'Hiburan', 'Gaya Hidup', 'Otomotif', 'Kesehatan', 'Pendidikan', 'Opini', 'Politik'];

  // Realtime backend only supports these platforms currently
  const PLATFORMS = ['detik', 'kompas', 'cnn', 'tempo', 'tribun'];
  const DATE_PRESETS = [
    { value: '', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: 'last_7_days', label: 'Last 7 Days' },
    { value: 'this_month', label: 'This Month' },
    { value: 'this_year', label: 'This Year' }
  ];

  const handleSearch = async (e, customQuery = null) => {
    if (e) e.preventDefault();
    const q = customQuery !== null ? customQuery : query;
    if (!q.trim()) return;

    setLoading(true);
    setResults([]);

    try {
      // Clean up filters to remove empty arrays/strings
      const activeFilters = {};
      if (filters.sources.length > 0) activeFilters.sources = filters.sources;
      if (filters.date_preset) activeFilters.date_preset = filters.date_preset;
      if (filters.date_from) activeFilters.date_from = filters.date_from;
      if (filters.date_to) activeFilters.date_to = filters.date_to;

      const res = await searchRealtime({ query: q, filters: activeFilters, top_k: 10 });

      // Sort by distance (smallest = most relevant)
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

  /**
   * Langsung ambil 10 berita terbaru dari platform tertentu.
   * Tidak menyentuh state filter & tidak butuh query.
   */
  const handleQuickSource = async (source) => {
    setLoadingSource(source);
    setActiveSource(source);
    setResults([]);
    setSearchTime(0);
    setTotalResults(0);

    try {
      // query: '' → backend akan skip embedding & langsung ambil berita nasional/terpopuler
      const res = await searchRealtime({ query: '', filters: { sources: [source] }, top_k: 10 });

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

  return (
    <div className="container animate-fade-in">
      {/* Hero Search Section */}
      <div style={{ textAlign: 'center', margin: '4rem 0 3rem' }}>
        <h1 className="text-gradient" style={{ fontSize: '3rem', marginBottom: '1rem' }}>
          Realtime Search
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginBottom: '2rem' }}>
          Live News Scraping & Sentence Embedding
        </p>

        <form onSubmit={handleSearch} style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'stretch' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
              <input
                type="text"
                className="input-glass w-full"
                style={{ paddingLeft: '2.75rem', paddingRight: '1rem', height: '44px', fontSize: '1rem' }}
                placeholder="Cari berita terkini berdasarkan makna..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ height: '44px', padding: '0 1.25rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {loading ? <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div> : <><Sparkles size={16} /> Search</>}
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

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-6">
            <div className="flex flex-wrap items-center gap-2">
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: '4px', whiteSpace: 'nowrap' }}>Berita Terbaru:</span>
              {PLATFORMS.map(p => {
                const isActive  = activeSource === p && !query;
                const isLoading = loadingSource === p;
                return (
                  <button
                    key={`quick-${p}`}
                    type="button"
                    disabled={loadingSource !== null}
                    className="btn-glass"
                    style={{
                      fontSize: '0.85rem',
                      padding: '4px 14px',
                      textTransform: 'capitalize',
                      background:   isActive  ? 'var(--primary)' : '',
                      borderColor:  isActive  ? 'var(--primary)' : '',
                      opacity:      loadingSource && !isLoading ? 0.5 : 1,
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}
                    onClick={() => handleQuickSource(p)}
                  >
                    {isLoading && <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }} />}
                    {p}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="btn-glass flex items-center justify-center gap-2 w-full sm:w-auto"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={16} /> Filters {filters.sources.length > 0 && `(${filters.sources.length})`}
            </button>
          </div>

          {/* Expandable Filters */}
          {showFilters && (
            <div className="glass-panel animate-fade-in mt-4" style={{ padding: '1.5rem', textAlign: 'left' }}>
              <div className="grid md:grid-cols-2">
                <div>
                  <h4 style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Berita Sumber</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {PLATFORMS.map(p => (
                      <button
                        key={p}
                        type="button"
                        className="btn-glass"
                        style={{ background: filters.sources.includes(p) ? 'var(--primary)' : '', fontSize: '0.9rem' }}
                        onClick={() => toggleSource(p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Waktu Terbit</h4>
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Dari Tanggal</label>
                        <input
                          type="date"
                          className="input-glass w-full"
                          style={{ padding: '0.4rem 0.5rem', fontSize: '0.9rem' }}
                          value={filters.date_from}
                          onChange={(e) => setFilters({ ...filters, date_from: e.target.value, date_preset: '' })}
                        />
                      </div>
                      <div className="flex-1">
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sampai</label>
                        <input
                          type="date"
                          className="input-glass w-full"
                          style={{ padding: '0.4rem 0.5rem', fontSize: '0.9rem' }}
                          value={filters.date_to}
                          onChange={(e) => setFilters({ ...filters, date_to: e.target.value, date_preset: '' })}
                        />
                      </div>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.2rem 0' }}>Atau gunakan preset:</div>

                    <div className="flex flex-col gap-2">
                      {DATE_PRESETS.map(d => (
                        <label key={d.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                          <input
                            type="radio"
                            name="date_preset"
                            checked={filters.date_preset === d.value && !filters.date_from && !filters.date_to}
                            onChange={() => setFilters({ ...filters, date_preset: d.value, date_from: '', date_to: '' })}
                            style={{ accentColor: 'var(--primary)' }}
                          />
                          {d.label}
                        </label>
                      ))}
                    </div>
                    <button type="button" className="btn-glass mt-2" onClick={() => setFilters({ sources: [], date_preset: '', date_from: '', date_to: '' })}>Reset Filter</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Results Section */}
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
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: 600,
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
                Read <ExternalLink size={13} />
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
