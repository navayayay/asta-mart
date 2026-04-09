const express = require('express');
const path = require('path');
const app = express();

// Cache static assets for 7 days (with fingerprinting in production)
app.use(express.static('.', {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : '1h',
  etag: false  // Use Last-Modified header instead
}));

// Don't cache HTML files (always check for updates)
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.set('Cache-Control', 'no-cache, must-revalidate, max-age=0, public');
  }
  next();
});

// Serve index.html for SPA routes (fallback for all other routes)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 5500;
app.listen(PORT, () => {
  console.log(`✅ Frontend server running on http://localhost:${PORT}`);
});
