const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const REALTIME_API_URL = process.env.NEXT_PUBLIC_API_URL_REALTIME || 'http://localhost:3001';

/**
 * Base fetch function to handle standard API calls
 */
async function fetchApi(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  console.log(url);
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.error || `HTTP Error ${response.status}`);
  }

  return response.json();
}

/**
 * Semantic Search API
 */
export async function searchSemantic({ query, top_k = 10, threshold = 0.0, filters = {} }) {
  return fetchApi('/search/semantic', {
    method: 'POST',
    body: JSON.stringify({
      query, // default 10
      top_k,
      threshold,
      filters
    })
  });
}


/**
 * Keyword Search API
 */
export async function searchKeyword({ keywords, match_type = 'all', page = 1, limit = 20, filters = {} }) {
  return fetchApi('/search/keyword', {
    method: 'POST',
    body: JSON.stringify({
      keywords,
      match_type,
      page,
      limit,
      filters
    })
  });
}

/**
 * 
 * Hybrid Search API
 */
export async function searchHybrid({ query, keywords = [], semantic_weight = 0.7, top_k = 10, filters = {} }) {
  return fetchApi('/search/hybrid', {
    method: 'POST',
    body: JSON.stringify({
      query,
      keywords,
      semantic_weight,
      top_k,
      filters
    })
  });
}

/**
 * Get News Statistics
 */
export async function getNewsStats() {
  return fetchApi('/news/stats');
}

/**
 * Get Trending Topics
 */
export async function getTrendingTopics(days = 7, limit = 100) {
  return fetchApi(`/analytics/trending?days=${days}&limit=${limit}`);
}

/**
 * Get Scraping Status
 */
export async function getScrapingStatus() {
  return fetchApi('/scrape/status');
}

/**
 * Trigger Manual Scrape
 */
export async function triggerManualScrape(sources = ['all'], max_articles = 200) {
  return fetchApi('/scrape/manual', {
    method: 'POST',
    body: JSON.stringify({
      sources,
      max_articles
    })
  });
}

/**
 * Realtime Search API (Node.js Backend) — NDJSON Streaming
 * 
 * @param {object} params
 * @param {string} params.query
 * @param {number} params.top_k
 * @param {object} params.filters
 * @param {Function} params.onProgress  — dipanggil setiap event progress: (event) => void
 * @param {AbortSignal} params.signal   — untuk cancel request
 */
export async function searchRealtime({ query, top_k = 10, filters = {}, onProgress, signal }) {
  const url = `${REALTIME_API_URL}/realtime/search`;
  console.log(url);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      sources: filters.sources?.length ? filters.sources : undefined,
      date_from: filters.date_from || undefined,
      date_to:   filters.date_to   || undefined,
      top_k,
    }),
    signal, // AbortController signal
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.error || `HTTP Error ${response.status}`);
  }

  // ── Baca NDJSON stream line-by-line ──
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // sisa baris belum lengkap

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed);
        if (onProgress) onProgress(event);
        // Jika event final, kembalikan hasilnya
        if (event.type === 'result') return event;
        if (event.type === 'error') throw new Error(event.message);
      } catch (parseErr) {
        // Abaikan baris yang bukan JSON valid
        console.warn('[API] Gagal parse NDJSON line:', trimmed);
      }
    }
  }

  throw new Error('Stream berakhir tanpa hasil.');
}
