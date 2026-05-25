"use client";

import { useState } from 'react';
import { Search, Sparkles, Filter, Calendar, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { searchSemantic, searchHybrid, searchKeyword } from '@/services/api';

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
  });

  const PLATFORMS = ['detik', 'kompas', 'cnn', 'tempo', 'liputan6', 'tribun', 'antara', 'sindonews', 'republika', 'jpnn'];
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

      if (searchMode === 'semantic') {
        res = await searchSemantic({ query, filters: activeFilters, top_k: 20 });
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

      setResults(res.results || []);
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
          Discover the Meaning of News
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginBottom: '2rem' }}>
          AI-powered semantic search engine scanning millions of Indonesian articles.
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
          
          <div className="flex items-center justify-between mt-4">
            <div className="flex gap-2">
              <button type="button" className={`btn-glass ${searchMode === 'semantic' ? 'active' : ''}`} style={{ background: searchMode === 'semantic' ? 'rgba(99, 102, 241, 0.2)' : '' }} onClick={() => setSearchMode('semantic')}>Semantic</button>
              <button type="button" className={`btn-glass ${searchMode === 'hybrid' ? 'active' : ''}`} style={{ background: searchMode === 'hybrid' ? 'rgba(99, 102, 241, 0.2)' : '' }} onClick={() => setSearchMode('hybrid')}>Hybrid</button>
              <button type="button" className={`btn-glass ${searchMode === 'keyword' ? 'active' : ''}`} style={{ background: searchMode === 'keyword' ? 'rgba(99, 102, 241, 0.2)' : '' }} onClick={() => setSearchMode('keyword')}>Keyword</button>
            </div>
            
            <button type="button" className="btn-glass flex items-center gap-2" onClick={() => setShowFilters(!showFilters)}>
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
                  <div className="flex flex-col gap-2">
                    {DATE_PRESETS.map(d => (
                      <label key={d.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input 
                          type="radio" 
                          name="date_preset" 
                          checked={filters.date_preset === d.value}
                          onChange={() => setFilters({...filters, date_preset: d.value})}
                          style={{ accentColor: 'var(--primary)' }}
                        />
                        {d.label}
                      </label>
                    ))}
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
              
              {(article.similarity_score !== undefined || article.combined_score !== undefined) && (
                <div className="score-badge">
                  <Sparkles size={12} />
                  {((article.combined_score || article.similarity_score) * 100).toFixed(1)}% Match
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
