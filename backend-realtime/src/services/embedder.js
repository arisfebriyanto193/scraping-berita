/**
 * embedder.js
 * Sentence Embedding service menggunakan @xenova/transformers
 * Model: paraphrase-multilingual-MiniLM-L12-v2 (support Bahasa Indonesia)
 * 
 * PENTING: Model akan di-download otomatis ke ~/.cache/huggingface saat pertama kali dijalankan (~120MB)
 */

import { pipeline, env } from '@xenova/transformers';

// Gunakan cache lokal agar tidak download ulang setiap restart
env.cacheDir = './model-cache';

let _pipe = null;
let _loading = false;
let _loadPromise = null;

/**
 * Lazy-load pipeline. Hanya load sekali, kemudian cache di memori.
 */
async function getPipeline() {
  if (_pipe) return _pipe;

  // Jika sedang loading, tunggu promise yang sama
  if (_loading) return _loadPromise;

  _loading = true;
  console.log('[Embedder] Loading model paraphrase-multilingual-MiniLM-L12-v2...');
  console.log('[Embedder] Jika pertama kali, model akan didownload (~120MB). Harap tunggu...');

  _loadPromise = pipeline(
    'feature-extraction',
    process.env.EMBEDDING_MODEL || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    { quantized: true } // Gunakan quantized agar lebih kecil dan cepat
  ).then((p) => {
    _pipe = p;
    _loading = false;
    console.log('[Embedder] ✅ Model berhasil dimuat!');
    return p;
  }).catch((err) => {
    _loading = false;
    _pipe = null;
    throw err;
  });

  return _loadPromise;
}

/**
 * Normalisasi vektor (L2 norm) agar cosine similarity bisa dihitung dengan dot product
 */
function normalizeVector(vec) {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vec;
  return vec.map(v => v / norm);
}

/**
 * Hitung mean pooling dari token embeddings
 */
function meanPooling(modelOutput) {
  const tokenEmbeddings = modelOutput.data;
  const shape = modelOutput.dims; // [batch, seq_len, hidden_dim]
  const [batch, seqLen, hiddenDim] = shape;

  const results = [];
  for (let b = 0; b < batch; b++) {
    const mean = new Array(hiddenDim).fill(0);
    for (let s = 0; s < seqLen; s++) {
      for (let h = 0; h < hiddenDim; h++) {
        mean[h] += tokenEmbeddings[b * seqLen * hiddenDim + s * hiddenDim + h];
      }
    }
    for (let h = 0; h < hiddenDim; h++) {
      mean[h] /= seqLen;
    }
    results.push(normalizeVector(mean));
  }
  return results;
}

/**
 * Embed satu atau banyak teks sekaligus.
 * @param {string[]} texts - Array of strings
 * @returns {Promise<number[][]>} - Array of normalized embedding vectors
 */
export async function embedTexts(texts) {
  const pipe = await getPipeline();
  const output = await pipe(texts, { pooling: 'mean', normalize: true });

  // output.data adalah flat array, dims adalah [batch, hidden_dim]
  // @xenova/transformers v2 sudah handle pooling jika option diberikan
  const dims = output.dims;
  const data = Array.from(output.data);

  const hiddenDim = dims[dims.length - 1];
  const batchSize = dims[0];

  const embeddings = [];
  for (let i = 0; i < batchSize; i++) {
    const vec = data.slice(i * hiddenDim, (i + 1) * hiddenDim);
    embeddings.push(normalizeVector(vec));
  }
  return embeddings;
}

/**
 * Hitung cosine similarity antara dua vektor (keduanya sudah dinormalisasi)
 * Hasil: 0.0 (tidak mirip) hingga 1.0 (identik)
 * Distance = 1 - similarity (0 = identik, 1 = tidak mirip)
 */
export function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
  }
  return Math.max(0, Math.min(1, dot)); // clamp ke [0, 1]
}

/**
 * Warm-up: load model saat server pertama start agar tidak lambat saat request pertama
 */
export async function warmup() {
  try {
    await embedTexts(['warmup text untuk memuat model ke memori']);
    console.log('[Embedder] ✅ Warmup selesai, model siap digunakan.');
  } catch (err) {
    console.error('[Embedder] ❌ Warmup gagal:', err.message);
  }
}
