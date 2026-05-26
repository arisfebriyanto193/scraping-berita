/**
 * index.js - Entry point Node.js Realtime Backend
 * 
 * Sistem Pencarian Berita Berbasis Semantic Search
 * Menggunakan Web Scraping dan Sentence Embedding
 * 
 * Port: 3001
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import searchRouter from './routes/search.js';
import { warmup } from './services/embedder.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '5mb' }));

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────
app.use('/realtime', searchRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Realtime News Search Backend',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log('='.repeat(55));
  console.log('  🚀 Realtime News Search Backend');
  console.log(`  📡 Listening on http://localhost:${PORT}`);
  console.log('='.repeat(55));

  // Load model AI saat startup agar request pertama tidak lambat
  console.log('\n[Server] Memuat model Sentence Embedding...');
  await warmup();
  console.log('[Server] ✅ Server siap menerima request!\n');
});
