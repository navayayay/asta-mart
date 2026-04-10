const express = require('express');
const path = require('path');
const app = express();

console.log('Server initialized');

// Test route
app.get('/test', (req, res) => {
  console.log('GET /test called');
  res.send('Test successful');
});

// Handle /vp-checkout/:region route - serve vp-product.html
app.get('/vp-checkout/:region', (req, res) => {
  console.log('GET /vp-checkout/:region called with region=', req.params.region);
  res.sendFile(path.resolve(__dirname, 'vp-product.html'));
});

// Serve static files - this handles .html, .css, .js, images, etc.
// This should come AFTER route handlers so they have priority
app.use(express.static(__dirname, {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : '1h',
  etag: false,
  setHeaders: (res, filepath) => {
    // Don't cache HTML files
    if (filepath.endsWith('.html')) {
      res.set('Cache-Control', 'no-cache, must-revalidate, max-age=0, public');
    }
  }
}));

// Fallback 404 handler
app.use((req, res) => {
  console.log('Fallback 404 for:', req.path);
  res.status(404).send('Not found');
});

const PORT = process.env.PORT || 5500;
app.listen(PORT, () => {
  console.log(`✅ Frontend server running on http://localhost:${PORT}`);
});
