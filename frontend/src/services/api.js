// const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
// const REALTIME_API_URL = process.env.NEXT_PUBLIC_API_URL_REALTIME || 'http://localhost:3001';

// /**
//  * Base fetch function to handle standard API calls
//  */
// async function fetchApi(endpoint, options = {}) {
//   const url = `${API_URL}${endpoint}`;
//   console.log(url);
//   const headers = {
//     'Content-Type': 'application/json',
//     ...options.headers,
//   };

//   const response = await fetch(url, {
//     ...options,
//     headers,
//   });

//   if (!response.ok) {
//     const errorData = await response.json().catch(() => ({}));
//     throw new Error(errorData.detail || errorData.error || `HTTP Error ${response.status}`);
//   }

//   return response.json();
// }

// /**
//  * Semantic Search API
//  */
// export async function searchSemantic({ query, top_k = 10, threshold = 0.0, filters = {} }) {
//   return fetchApi('/search/semantic', {
//     method: 'POST',
//     body: JSON.stringify({
//       query, // default 10
//       top_k,
//       threshold,
//       filters
//     })
//   });
// }


// /**
//  * Keyword Search API
//  */
// export async function searchKeyword({ keywords, match_type = 'all', page = 1, limit = 20, filters = {} }) {
//   return fetchApi('/search/keyword', {
//     method: 'POST',
//     body: JSON.stringify({
//       keywords,
//       match_type,
//       page,
//       limit,
//       filters
//     })
//   });
// }

// /**
//  * 
//  * Hybrid Search API
//  */
// export async function searchHybrid({ query, keywords = [], semantic_weight = 0.7, top_k = 10, filters = {} }) {
//   return fetchApi('/search/hybrid', {
//     method: 'POST',
//     body: JSON.stringify({
//       query,
//       keywords,
//       semantic_weight,
//       top_k,
//       filters
//     })
//   });
// }

// /**
//  * Get News Statistics
//  */
// export async function getNewsStats() {
//   return fetchApi('/news/stats');
// }

// /**
//  * Get Trending Topics
//  */
// export async function getTrendingTopics(days = 7, limit = 100) {
//   return fetchApi(`/analytics/trending?days=${days}&limit=${limit}`);
// }

// /**
//  * Get Scraping Status
//  */
// export async function getScrapingStatus() {
//   return fetchApi('/scrape/status');
// }

// /**
//  * Trigger Manual Scrape
//  */
// export async function triggerManualScrape(sources = ['all'], max_articles = 200) {
//   return fetchApi('/scrape/manual', {
//     method: 'POST',
//     body: JSON.stringify({
//       sources,
//       max_articles
//     })
//   });
// }

// /**
//  * Realtime Search API (Node.js Backend)
//  * mode: 'kurasi' | 'auto'
//  * custom_urls: array of portal URLs (for mode 'auto')
//  */
// export async function searchRealtime({ query, top_k = 10, filters = {}, mode = 'kurasi', custom_urls = [] }) {
//   const url = `${REALTIME_API_URL}/realtime/search`;
//   console.log(url);
//   const response = await fetch(url, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({
//       query,
//       mode,
//       custom_urls: mode === 'auto' ? custom_urls : undefined,
//       sources: mode === 'kurasi' && filters.sources?.length ? filters.sources : undefined,
//       date_from: filters.date_from || undefined,
//       date_to: filters.date_to || undefined,
//       top_k
//     })
//   });

//   if (!response.ok) {
//     const errorData = await response.json().catch(() => ({}));
//     throw new Error(errorData.detail || errorData.error || `HTTP Error ${response.status}`);
//   }

//   return response.json();
// }


//#const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const BASE_URL ="https://be-semantic.qbyte.web.id/py/";
/**
 * POST /api/search/realtime
 *
 * @param {Object} params
 * @param {string}   params.query        - Kata kunci (opsional)
 * @param {string[]} params.custom_urls  - Array URL portal berita
 * @param {number}   params.top_k        - Jumlah artikel (default 10)
 * @param {string}   params.mode         - "auto" | "kurasi"
 * @param {Object}   params.filters      - { date_preset, date_from, date_to }
 *
 * @returns {Promise<{ results: Article[], total: number, query_time: number }>}
 */
export async function searchRealtime({ query = "", custom_urls = [], top_k = 10, mode = "auto", filters = {} }) {
  const res = await fetch(`${BASE_URL}/api/search/realtime`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, custom_urls, top_k, mode, filters }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error: ${res.status}`);
  }

  return res.json();
}

/**
 * GET /api/health — cek apakah Flask API hidup
 */
export async function checkHealth() {
  const res = await fetch(`${BASE_URL}/api/health`);
  return res.json();
}
