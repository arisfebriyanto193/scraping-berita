

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

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
