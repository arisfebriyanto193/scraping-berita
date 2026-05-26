"use client";

import { useState, useEffect } from 'react';
import { getNewsStats, getTrendingTopics, getScrapingStatus, triggerManualScrape } from '@/services/api';
import { Database, TrendingUp, RefreshCw, Layers, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [trending, setTrending] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeResult, setScrapeResult] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [statsRes, trendRes, statusRes] = await Promise.all([
        getNewsStats(),
        getTrendingTopics(7, 10),
        getScrapingStatus()
      ]);
      setStats(statsRes);
      setTrending(trendRes);
      setStatus(statusRes);
    } catch (error) {
      console.error("Dashboard error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualScrape = async () => {
    setScrapeLoading(true);
    setScrapeResult(null);
    try {
      const res = await triggerManualScrape(['all'], 30); // 30 artikel per sumber = max 300 artikel
      setScrapeResult(res);
      // Refresh stats
      fetchDashboardData();
    } catch (error) {
      setScrapeResult({ success: false, error: error.message });
    } finally {
      setScrapeLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container flex justify-center items-center" style={{ minHeight: '60vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="container animate-fade-in">
      <div className="flex justify-between items-center" style={{ marginBottom: '2rem' }}>
        <h2>System Dashboard</h2>
        <button className="btn-glass flex items-center gap-2" onClick={fetchDashboardData}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="grid md:grid-cols-3" style={{ marginBottom: '2rem' }}>
        {/* Total Articles Stat */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: '1rem', color: 'var(--primary)' }}>
            <Database size={24} />
            <h3 style={{ color: 'var(--text-main)' }}>Total Articles</h3>
          </div>
          <div style={{ fontSize: '3rem', fontWeight: 'bold', fontFamily: 'var(--font-heading)' }}>
            {stats?.total_articles.toLocaleString() || 0}
          </div>
          <p style={{ color: 'var(--text-muted)' }}>Indexed in MySQL</p>
        </div>

        {/* FAISS Index Stat */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: '1rem', color: 'var(--secondary)' }}>
            <Layers size={24} />
            <h3 style={{ color: 'var(--text-main)' }}>Vector Embeddings</h3>
          </div>
          <div style={{ fontSize: '3rem', fontWeight: 'bold', fontFamily: 'var(--font-heading)' }}>
            {stats?.faiss_index_size.toLocaleString() || 0}
          </div>
          <p style={{ color: 'var(--text-muted)' }}>FAISS Index Size</p>
        </div>

        {/* Scraping Status */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: '1rem', color: 'var(--success)' }}>
            <CheckCircle2 size={24} />
            <h3 style={{ color: 'var(--text-main)' }}>Last Scraped</h3>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: 'var(--font-heading)', marginBottom: '0.5rem' }}>
            {status?.last_scraped ? format(new Date(status.last_scraped), 'dd MMM, HH:mm') : 'Never'}
          </div>
          
          <button 
            className="btn-primary w-full" 
            style={{ marginTop: '1rem' }}
            onClick={handleManualScrape}
            disabled={scrapeLoading}
          >
            {scrapeLoading ? <div className="spinner"></div> : 'Trigger Scrape Now'}
          </button>
          
          {scrapeResult && (
            <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: scrapeResult.success ? 'var(--success)' : '#ef4444' }}>
              {scrapeResult.success ? `Scraped ${scrapeResult.total_scraped} articles` : `Error: ${scrapeResult.error}`}
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2">
        {/* Sources Breakdowns */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Sources Breakdown
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Object.entries(stats?.by_source || {}).sort((a,b) => b[1] - a[1]).map(([source, count]) => {
              const max = Math.max(...Object.values(stats?.by_source || { a: 1 }));
              const percentage = (count / max) * 100;
              return (
                <div key={source}>
                  <div className="flex justify-between" style={{ fontSize: '0.9rem', marginBottom: '4px' }}>
                    <span style={{ textTransform: 'capitalize' }}>{source}</span>
                    <span>{count.toLocaleString()}</span>
                  </div>
                  <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${percentage}%`, background: 'var(--primary)', height: '100%', borderRadius: '4px' }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trending Topics */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={20} color="var(--secondary)" /> Trending Keywords
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {trending?.trending?.map((item, idx) => (
              <div key={idx} style={{ 
                background: 'rgba(255,255,255,0.05)', 
                border: '1px solid var(--surface-border)',
                padding: '0.5rem 1rem', 
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span style={{ color: 'var(--secondary)' }}>#{idx + 1}</span>
                <span style={{ fontWeight: '500' }}>{item.keyword}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({item.count})</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
