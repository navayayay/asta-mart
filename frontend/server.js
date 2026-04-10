const express = require('express');
const path = require('path');
const app = express();

app.get('/vp-checkout/:region', (req, res) => {
  res.sendFile(path.join(__dirname, 'vp-product.html'));
});

app.use(express.static(__dirname, { maxAge: '1h', etag: false }));

app.listen(5500, () => console.log('✅ Server :5500'));

#!/usr/bin/env node
const express = require('express');
const path = require('path');
const app = express();

// Route for /vp-checkout/:region - serve vp-product.html for checkout pages
app.get('/vp-checkout/:region', (req, res) => {
  const filePath = path.join(__dirname, 'vp-product.html');
  res.sendFile(filePath);
});

// Serve all other static files (HTML, CSS, JS, images, etc.)
app.use(express.static(__dirname, {
  maxAge: '1h',
  etag: false,
  setHeaders: (res, filepath) => {
    if (filepath.endsWith('.html')) {
      res.set('Cache-Control', 'no-cache, must-revalidate, max-age=0, public');
    }
  }
}));

const PORT = process.env.PORT || 5500;
app.listen(PORT, () => {
  console.log(`Frontend server running on http://localhost:${PORT}`);
});
const express = require('express');
const path = require('path');
const app = express();

console.log('Server initialized');

// Log all requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Test route
app.get('/test', (req, res) => {
  console.log('GET /test handler matched');
  res.send('Test successful');
});

// Handle /vp-checkout/:region route - serve vp-product.html
app.get('/vp-checkout/:region', (req, res) => {
  console.log('GET /vp-checkout/:region matched with region=', req.params.region);
  res.sendFile(path.resolve(__dirname, 'vp-product.html'), (err) => {
    if (err) {
      console.error('Error serving vp-product.html:', err.message);
      res.status(500).send('Error loading checkout page');
    }
  });
});

// Serve static files - this handles .html, .css, .js, images, etc.
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
