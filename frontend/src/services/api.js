const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

/**
 * Base fetch function to handle standard API calls
 */
async function fetchApi(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  
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
export async function searchSemantic({ query, top_k = 20, threshold = 0.0, filters = {} }) {
  return fetchApi('/search/semantic', {
    method: 'POST',
    body: JSON.stringify({
      query,
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
 * Hybrid Search API
 */
export async function searchHybrid({ query, keywords = [], semantic_weight = 0.7, top_k = 20, filters = {} }) {
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
export async function getTrendingTopics(days = 7, limit = 10) {
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
export async function triggerManualScrape(sources = ['all'], max_articles = 20) {
  return fetchApi('/scrape/manual', {
    method: 'POST',
    body: JSON.stringify({
      sources,
      max_articles
    })
  });
}
