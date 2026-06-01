"use client";

import { useState } from 'react';
import { Search, Sparkles, Filter, Calendar, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { searchSemantic, searchHybrid, searchKeyword, searchRealtime } from '@/services/api';

export default function Home() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [totalResults, setTotalResults] = useState(0);

  // Search Settings
  const [searchMode, setSearchMode] = useState('semantic'); // 'semantic', 'hybrid', 'keyword'
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    sources: [],
    date_preset: '',
    date_from: '',
    date_to: '',
  });

  const PLATFORMS = ['detik', 'kompas', 'cnn', 'tempo', 'liputan6', 'tribun', 'antara', 'sindonews', 'republika', 'jpnn', 'cnbcindonesia'];
  const DATE_PRESETS = [
    { value: '', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: 'last_7_days', label: 'Last 7 Days' },
    { value: 'this_month', label: 'This Month' },
    { value: 'this_year', label: 'This Year' }
  ];

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setResults([]);

    try {
      let res;
      // Clean up filters to remove empty arrays/strings
      const activeFilters = {};
      if (filters.sources.length > 0) activeFilters.sources = filters.sources;
      if (filters.date_preset) activeFilters.date_preset = filters.date_preset;
      if (filters.date_from) activeFilters.date_from = filters.date_from;
      if (filters.date_to) activeFilters.date_to = filters.date_to;

      if (searchMode === 'semantic') {
        res = await searchSemantic({ query, filters: activeFilters, top_k: 20, threshold: 0.3 });
      } else if (searchMode === 'hybrid') {
        res = await searchHybrid({
          query,
          keywords: query.split(' ').filter(w => w.length > 3),
          filters: activeFilters
        });
      } else {
        res = await searchKeyword({
          keywords: query.split(' '),
          filters: activeFilters
        });
      }

      // Urutkan dari distance terkecil (paling relevan) ke terbesar
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
      {/* Hero Search Section */}
      <div style={{ textAlign: 'center', margin: '4rem 0 3rem' }}>
        <h1 className="text-gradient" style={{ fontSize: '3rem', marginBottom: '1rem' }}>
          Semantic Search
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginBottom: '2rem' }}>
          Sentence Embedding
        </p>

        <form onSubmit={handleSearch} style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: '1rem', position: 'relative' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={20} />
              <input
                type="text"
                className="input-glass w-full"
                style={{ paddingLeft: '3rem', fontSize: '1.1rem', height: '56px' }}
                placeholder="Tulis apa saja yang ingin Anda cari berdasarkan makna..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading} style={{ height: '56px', minWidth: '140px' }}>
              {loading ? <div className="spinner"></div> : <><Sparkles size={20} /> Search</>}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-4 w-full">
            <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2 w-full">
              <button type="button" className={`btn-glass flex items-center justify-center w-full sm:w-auto ${searchMode === 'semantic' ? 'active' : ''}`} style={{ background: searchMode === 'semantic' ? 'rgba(99, 102, 241, 0.2)' : '' }} onClick={() => setSearchMode('semantic')}>Semantic</button>
              
              <button type="button" className={`btn-glass flex items-center justify-center w-full sm:w-auto ${searchMode === 'hybrid' ? 'active' : ''}`} style={{ background: searchMode === 'hybrid' ? 'rgba(99, 102, 241, 0.2)' : '' }} onClick={() => setSearchMode('hybrid')}>Hybrid</button>

              <button type="button" className={`btn-glass flex items-center justify-center w-full sm:w-auto ${searchMode === 'keyword' ? 'active' : ''}`} style={{ background: searchMode === 'keyword' ? 'rgba(99, 102, 241, 0.2)' : '' }} onClick={() => setSearchMode('keyword')}>Keyword</button>
            </div>

            <button type="button" className="btn-glass flex items-center justify-center gap-2 w-full sm:w-auto shrink-0" onClick={() => setShowFilters(!showFilters)}>
              <Filter size={16} /> Filters {filters.sources.length > 0 && `(${filters.sources.length})`}
            </button>
          </div>

          {/* Expandable Filters */}
          {showFilters && (
            <div className="glass-panel animate-fade-in mt-4" style={{ padding: '1.5rem', textAlign: 'left' }}>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Berita Sumber</h4>
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                    {PLATFORMS.map(p => (
                      <button
                        key={p}
                        type="button"
                        className="btn-glass flex items-center justify-center"
                        style={{ background: filters.sources.includes(p) ? 'var(--primary)' : '', fontSize: '0.9rem', width: '100%' }}
                        onClick={() => toggleSource(p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Waktu Terbit</h4>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Dari Tanggal</label>
                        <input
                          type="date"
                          className="input-glass w-full"
                          style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                          value={filters.date_from}
                          onChange={(e) => setFilters({ ...filters, date_from: e.target.value, date_preset: '' })}
                        />
                      </div>
                      <div className="flex-1">
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Sampai</label>
                        <input
                          type="date"
                          className="input-glass w-full"
                          style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                          value={filters.date_to}
                          onChange={(e) => setFilters({ ...filters, date_to: e.target.value, date_preset: '' })}
                        />
                      </div>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Atau gunakan preset:</div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {DATE_PRESETS.map(d => (
                        <label key={d.label} className="btn-glass" style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem',
                          background: (filters.date_preset === d.value && !filters.date_from && !filters.date_to) ? 'var(--primary)' : '',
                          padding: '6px 10px', width: '100%'
                        }}>
                          <input
                            type="radio"
                            name="date_preset"
                            className="hidden"
                            checked={filters.date_preset === d.value && !filters.date_from && !filters.date_to}
                            onChange={() => setFilters({ ...filters, date_preset: d.value, date_from: '', date_to: '' })}
                          />
                          {d.label}
                        </label>
                      ))}
                    </div>
                    <button type="button" className="btn-glass mt-2 w-full sm:w-auto" style={{ alignSelf: 'flex-start' }} onClick={() => setFilters({ sources: [], date_preset: '', date_from: '', date_to: '' })}>Reset Filter</button>
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

      <div className="grid md:grid-cols-2 lg:grid-cols-3">
        {results.map((article, idx) => (
          <div key={`${article.id}-${idx}`} className="glass-card flex flex-col" style={{ padding: '1.5rem', height: '100%' }}>
            <div className="flex justify-between items-center mb-4">
              <span style={{
                background: 'rgba(255,255,255,0.1)',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: '1px'
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

            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', flexGrow: 0 }}>
              <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'none' }}>
                {article.title}
              </a>
            </h3>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1.5rem', flexGrow: 1 }}>
              {article.content.substring(0, 150)}...
            </p>

            <div className="flex justify-between items-center" style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--surface-border)' }}>
              <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <Calendar size={14} />
                {article.published_date ? format(new Date(article.published_date), 'dd MMM yyyy') : 'Unknown'}
              </div>
              <a href={article.url} target="_blank" rel="noopener noreferrer" className="nav-link flex items-center gap-2" style={{ fontSize: '0.85rem' }}>
                Read <ExternalLink size={14} />
              </a>
            </div>
          </div>
        ))}
      </div>

      {results.length === 0 && searchTime > 0 && (
        <div className="text-center" style={{ padding: '4rem 0', color: 'var(--text-muted)' }}>
          <h3>Tidak ada berita yang relevan ditemukan.</h3>
          <p>Coba gunakan kata kunci lain atau ubah mode pencarian.</p>
        </div>
      )}
    </div>
  );
}
