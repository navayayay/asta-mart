# ASTA MART — COMPLETE PRE-LAUNCH AUDIT REPORT
**Audit Date:** April 9, 2026  
**Status:** Multiple critical and high-priority issues must be resolved before launch  
**Overall Verdict:** ❌ **NOT READY FOR LAUNCH** — 3 critical, 8 high-priority issues require immediate remediation

---

## EXECUTIVE SUMMARY

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 **CRITICAL** | 3 | Must fix before launch |
| 🟠 **HIGH** | 8 | Should fix before launch |
| 🟡 **MEDIUM** | 7 | Fix before or shortly after launch |
| 🔵 **LOW** | 6 | Nice-to-have optimizations |
| ℹ️ **INFO** | 3 | Documentation/best practices |
| **TOTAL** | **27** | **33 remaining after previous fixes** |

### Key Risk Assessment
- **Security Posture:** 7/10 (good controls, but critical hardcoded data & header issues)
- **Code Quality:** 7/10 (well-structured, consistent patterns, but error handling gaps)
- **Performance:** 8/10 (optimized, but cache headers not production-ready)
- **Mobile-Ready:** 9/10 (responsive, accessible)
- **Reliability:** 7/10 (decent error handling, but potential null/undefined crashes)

---

## CRITICAL ISSUES (MUST FIX IMMEDIATELY)

### [CRITICAL-1] Hardcoded UPI ID Exposed in Frontend (2 locations)
**Severity:** 🔴 CRITICAL  
**Type:** Security & Privacy Breach  
**Files:**
- [d:\site\frontend\create-listing.html](d:\site\frontend\create-listing.html#L596)
- [d:\site\frontend\get-edit.html](d:\site\frontend\get-edit.html#L202)

**Problem:**
```html
<!-- Line 596 in create-listing.html -->
<strong style="color: var(--accent-cyan);">navay@fam</strong>

<!-- Line 202 in get-edit.html -->
<div class="upi-id">navay@fam</div>
```

Personal UPI ID hardcoded in client code. This:
1. Exposes personal financial information globally
2. Violates privacy/PCI compliance
3. Makes personal account vulnerable to unauthorized transactions
4. Should be dynamically retrieved from user profile or admin config

**Why it Matters:** This is a **direct privacy violation** and **financial security risk**. The ID is visible in frontend code and can be extracted by anyone viewing page source.

**Fix:**
Replace hardcoded UPI with dynamic data. Two options:

**Option A: Retrieve from user profile (recommended)**
```javascript
// In create-listing.html, after user loads
async function loadSellerUPI() {
  try {
    const res = await authFetch(`${API_BASE_URL}/users/profile`);
    if (!res.ok) throw new Error('Failed to fetch profile');
    const profile = await res.json();
    const upiDisplay = document.querySelector('.upi-id-display');
    if (upiDisplay && profile.upi) {
      upiDisplay.textContent = profile.upi;
    }
  } catch (err) {
    console.error('Failed to load UPI:', err);
    document.querySelector('.upi-id-display').textContent = 'Contact seller for UPI';
  }
}

// Call on page load:
document.addEventListener('DOMContentLoaded', () => {
  if (user) loadSellerUPI();
});
```

**Option B: Store in environment variable (simpler)**
```html
<!-- Backend serves this via API endpoint -->
<!-- Frontend JavaScript -->
<script>
  // Fetch from API instead of hardcoding
  fetch(`${API_BASE_URL}/config/payment-upi`)
    .then(r => r.json())
    .then(data => {
      document.querySelector('.upi-id').textContent = data.upi;
    })
    .catch(() => {
      document.querySelector('.upi-id').textContent = 'Contact seller for payment details';
    });
</script>

<!-- In backend/server.js -->
app.get('/api/config/payment-upi', (req, res) => {
  // Read from env var set by admin, never hardcode
  res.json({ 
    upi: process.env.PAYMENT_UPI_ID ||  'seller@bank',
    lastUpdated: new Date()
  });
});
```

**Deadline:** BEFORE ANY PRODUCTION DEPLOYMENT

---

### [CRITICAL-2] Missing X-Frame-Options Security Header
**Severity:** 🔴 CRITICAL  
**Type:** Clickjacking Vulnerability  
**File:** [d:\site\backend\server.js](d:\site\backend\server.js#L38-L48)

**Problem:**
Helmet configuration is present but missing `frameguard` directive. Application can be embedded in iframes on attacker sites.

```javascript
// Current (line 38-48):
app.use(helmet({
  contentSecurityPolicy: {
    directives: { /* ... */ }
  }
  // ❌ Missing: frameguard
}));
```

**Risk:** Clickjacking attacks where malicious site embeds your pages in invisible iframes and tricks users into performing actions.

**Fix:**
```javascript
// In backend/server.js, update Helmet config:
app.use(helmet({
  contentSecurityPolicy: {
    directives: { /* ... */ }
  },
  frameguard: {
    action: 'deny'  // Prevent embedding in ANY iframe
  },
  noSniff: true,    // Prevent MIME sniffing
  xssFilter: true,  // Legacy XSS filter
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
```

**Deadline:** BEFORE LAUNCH

---

### [CRITICAL-3] No HTTPS Redirect Middleware (Production Risk)
**Severity:** 🔴 CRITICAL  
**Type:** Man-in-the-Middle Vulnerability  
**File:** [d:\site\backend\server.js](d:\site\backend\server.js#L1)

**Problem:**
Backend doesn't enforce HTTPS in production. Users accessing `http://api.asta-mart.in` will not be redirected, exposing credentials and data to MITM attacks.

**Current Issue:** 
- No HTTP→HTTPS redirect middleware
- No HSTS header (Strict-Transport-Security)
- Cookies set with `secure: process.env.NODE_ENV === 'production'` but no force-redirect

**Fix:**
```javascript
// Add this BEFORE all other middleware in backend/server.js (after line 36):

// --- HTTPS ENFORCEMENT (Production Only) ---
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(301, `https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}

// Also update Helmet configuration:
app.use(helmet({
  contentSecurityPolicy: { /* ... */ },
  frameguard: { action: 'deny' },
  hsts: {
    maxAge: 31536000,  // 1 year
    includeSubDomains: true,
    preload: true
  },
  // ... rest of config
}));
```

**Also update cookies:**
```javascript
// For user auth cookie (line ~365):
res.cookie('am_token', token, {
  httpOnly: true,
  secure: true,  // ALWAYS true in production
  sameSite: 'Lax',
  maxAge: 7 * 24 * 60 * 60 * 1000
});

// For admin cookie (line ~434):
res.cookie('am_admin', token, {
  httpOnly: true,
  secure: true,  // ALWAYS true in production  
  sameSite: 'Lax',
  maxAge: 4 * 60 * 60 * 1000
});
```

**Deadline:** BEFORE LAUNCH

---

## HIGH-PRIORITY ISSUES (SHOULD FIX)

### [HIGH-1] Missing CSRF Token Protection on State-Changing Routes
**Severity:** 🟠 HIGH  
**Type:** CSRF Attack Vulnerability  
**Affected Routes:**
- POST `/api/listings` (create listing)
- DELETE `/api/listings/:id` (delete listing)
- POST `/api/vault/sync` (sync account)
- PATCH `/api/listings/:id/status` (update status)
- Multiple other POST/PUT/DELETE routes

**Problem:**
No CSRF token validation. Attacker can craft malicious HTML on attacker.com that, when visited by logged-in user, automatically makes authenticated requests to your API.

```html
<!-- On attacker.com -->
<form action="https://api.asta-mart.in/api/listings" method="POST">
  <input name="title" value="Phishing Listing">
  <input name="price" value="99999">
  <input name="region" value="AP">
</form>
<script>
  document.forms[0].submit();  // Auto-submit on page load
</script>
```

Since request includes httpOnly cookie automatically, this works.

**Fix:**
```javascript
// 1. Backend: Install CSRF protection package
// Run: npm install csurf

// 2. In backend/server.js (after middleware setup, line ~180):
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: false });  // Use session-based tokens

// For forms that need CSRF token, add middleware:
// Example for create listing route (wrap with csrfProtection):
app.post('/api/listings', requireAuth, csrfProtection, [
  body('title').trim().notEmpty().isLength({ max: 200 }),
  // ... rest of validation
], async (req, res) => {
  // CSRF token is now required in request body: { csrfToken: '...' }
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // rest of handler unchanged
  } catch (err) {
    console.error('❌ Create Listing Error:', err);
    res.status(500).json({ error: 'Creation failed' });
  }
});

// 3. Frontend: Include CSRF token in all state-changing requests
// In app.js, modify authFetch to include CSRF token:
async function authFetch(url, options = {}) {
  // Get CSRF token from page meta tag or session
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || 
                    sessionStorage.getItem('csrf_token');
  
  const res = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
      'CSRF-Token': csrfToken  // Include token in header
    },
    credentials: 'include'
  });
  
  if (res.status === 401) {
    warn('⚠️ Session expired (401 Unauthorized)');
    localStorage.removeItem('am_user');
    openAuth('login');
    throw new Error('Session expired. Please log in again.');
  }
  
  return res;
}

// 4. Serve CSRF token on page load
// In backend, add route:
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// In frontend, fetch token on init:
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const tokenRes = await fetch(`${API_BASE_URL}/csrf-token`);
    const { csrfToken } = await tokenRes.json();
    sessionStorage.setItem('csrf_token', csrfToken);
  } catch (err) {
    console.error('Failed to get CSRF token');
  }
});
```

**Deadline:** BEFORE LAUNCH

---

### [HIGH-2] No Frontend Cache Headers for Static Assets (Performance)
**Severity:** 🟠 HIGH  
**Type:** Performance & Caching Issue  
**File:** [d:\site\frontend](d:\site\frontend)

**Problem:**
Frontend is served with `http-server` with cache disabled (`-c-1` flag in package.json start script). This means:
- Every page load re-downloads CSS, JavaScript, images
- No browser caching = slow load times
- Excessive bandwidth usage
- Poor Core Web Vitals scores

**Current package.json:**
```json
"start": "http-server . -p 5500 -c-1"  // ❌ -c-1 disables all caching
```

**Fix:**
```json
// In frontend/package.json, change start script:
"start": "http-server . -p 5500 -c 3600",  // Cache for 1 hour

// OR add .nojekyll file (tells http-server to serve static files properly)
// Create: frontend/.nojekyll (empty file)

// Better: Configure proper cache headers via server config
// Create: frontend/.htaccess or use Node.js static server:
"start": "node server.js"

// Create: frontend/server.js
const express = require('express');
const app = express();

// Cache static assets for 1 year (with fingerprinting in production)
app.use(express.static('.', {
  maxAge: process.env.NODE_ENV === 'production' ? '1y' : '1h',
  etag: false  // Use Last-Modified header instead
}));

// Don't cache HTML files
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-cache, must-revalidate');
  }
  next();
});

app.listen(5500, () => console.log('Frontend on :5500'));
```

OR for production (recommended):

```javascript
// In backend/server.js, serve frontend with correct cache headers:
const path = require('path');

app.use(express.static(path.join(__dirname, '../frontend'), {
  maxAge: '7d',  // Cache for 7 days
  etag: false
}));

// Bust cache on version change
app.use((req, res, next) => {
  if (req.path.match(/\.(js|css|png|jpg|jpeg|svg|gif|webp)$/i)) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');  // 1 year
  } else if (req.path.endsWith('.html') || req.path === '/') {
    res.set('Cache-Control', 'no-cache, must-revalidate, max-age=0');
  }
  next();
});
```

**Deadline:** BEFORE LAUNCH (at least enable 1h caching)

---

### [HIGH-3] Potential Array Index Out of Bounds in Skill Tag Generation
**Severity:** 🟠 HIGH  
**Type:** Runtime Crash / Null Pointer  
**File:** [d:\site\frontend\app.js](d:\site\frontend\app.js#L450-L460)

**Problem:**
```javascript
// Line 450-460 in app.js
function generateSkinsGrid(skinTags) {
  if(!skinTags || skinTags.length === 0) return '<p style="...">No skins...</p>';
  
  return skinTags.map(skin => {
    const skinObj = typeof skin === 'string' ? JSON.parse(skin) : skin;
    const safeIcon = isSafeIconUrl(skinObj.icon) ? skinObj.icon : '';
    
    // ❌ CRASH RISK: What if skinObj is not an object?
    return `<div class="skin-card tier-${skinObj.tier}">
      <img src="${safeIcon}" alt="${sanitize(skinObj.name)}">
    </div>`;
  }).join('');
}
```

If `skinTags` contains invalid JSON or malformed objects, `.map()` will crash the page.

**Fix:**
```javascript
function generateSkinsGrid(skinTags) {
  if (!skinTags || skinTags.length === 0) return '<p style="color:var(--white-dim); grid-column: 1/-1; text-align:center; padding: 40px;">No skins detailed by seller.</p>';
  
  return skinTags.map(skin => {
    try {
      const skinObj = typeof skin === 'string' ? JSON.parse(skin) : skin;
      
      // ✅ Validate required fields exist
      if (!skinObj || typeof skinObj !== 'object' || !skinObj.name) {
        return '';  // Skip malformed items
      }
      
      const safeIcon = isSafeIconUrl(skinObj.icon) ? skinObj.icon : '';
      const tierClass = ['premium', 'exclusive', 'ultra', 'battlepass'].includes(skinObj.tier) 
        ? `tier-${skinObj.tier}` 
        : 'tier-premium';  // Default tier
      
      return `<div class="skin-card ${tierClass}">
        <img src="${safeIcon}" alt="${sanitize(skinObj.name)}" style="height: 60px; object-fit: contain; margin-bottom: 15px;">
        <div class="skin-name">${sanitize(skinObj.name)}</div>
      </div>`;
    } catch (err) {
      logErr('Malformed skin data:', err);
      return '';  // Skip this item
    }
  }).filter(item => item !== '').join('');
}

// Apply same fix to generateAgentsGrid (line ~476):
function generateAgentsGrid(agents) {
  if (!agents || agents.length === 0) return '<p style="color:var(--white-dim); grid-column: 1/-1; text-align:center; padding: 40px;">No specific agents detailed by seller.</p>';
  
  return agents.map(tagStr => {
    try {
      const agent = typeof tagStr === 'string' ? JSON.parse(tagStr) : tagStr;
      
      // ✅ Validate required fields
      if (!agent || typeof agent !== 'object' || !agent.name) {
        return '';
      }
      
      const safeIcon = isSafeIconUrl(agent.icon) ? agent.icon : '';
      return `<div class="skin-card tier-battlepass">
        <img src="${safeIcon}" alt="${sanitize(agent.name)}" style="height: 50px; margin-bottom: 10px;">
        <div class="skin-name">${sanitize(agent.name)}</div>
      </div>`;
    } catch (err) {
      logErr('Malformed agent data:', err);
      return '';
    }
  }).filter(item => item !== '').join('');
}
```

**Deadline:** BEFORE LAUNCH

---

### [HIGH-4] Missing Optional Chaining in Multiple API Response Handlers
**Severity:** 🟠 HIGH  
**Type:** Potential Null Pointer Runtime Crash  
**Locations:**
- [d:\site\frontend\app.js](d:\site\frontend\app.js#L596) - Multiple array accesses without null checks
- [d:\site\frontend\app.js](d:\site\frontend\app.js#L639) - Battlepass tags length access
- [d:\site\frontend\app.js](d:\site\frontend\app.js#L708) - Similar listing filter

**Problem:**
```javascript
// Line 596-597:
const totalSkinCount = (l.skinTags || []).length;  // ✅ Good
const agentsLength = l.agentsCount || (l.agents ? l.agents.length : 0);  // ⚠️ Incomplete

// Line 639:
<button>Battlepass (${(l.battlepassTags || []).length})</button>

// Line 708:
const similar = getAllListings().filter(x => x._id !== l._id && x.region === l.region).slice(0, 4);
// ❌ What if getAllListings() returns null/undefined? What if x._id or x.region is undefined?
```

If API returns unexpected structure, app can crash with "Cannot read property 'length' of undefined".

**Fix:**
```javascript
// Use optional chaining operator (?.) everywhere:

// Line 596-597:
const totalSkinCount = l.skinTags?.length ?? 0;
const agentsLength = l.agentsCount ?? l.agents?.length ?? 0;

// Line 639:
<button class="inv-tab" onclick="switchInvTab('battlepass', this)">Battlepass (${l.battlepassTags?.length ?? 0})</button>

// Line 708:
const similar = (getAllListings() || []).filter(x => x?._id !== l?._id && x?.region === l?.region)?.slice(0, 4) ?? [];

// Better version for listing detail line 639-640:
const agentsCount = l?.agentsCount ?? l?.agents?.length ?? 0;
const totalSkinCount = l?.skinTags?.length ?? 0;

// Line 708 fix:
const similar = (getAllListings() || [])
  .filter(x => x && x._id && l._id && x._id !== l._id && x.region === l.region)
  .slice(0, 4);
```

**Deadline:** BEFORE LAUNCH

---

### [HIGH-5] No Error Boundary for Unhandled Promise Rejections
**Severity:** 🟠 HIGH  
**Type:** Silent Failures / White Screen of Death  
**File:** [d:\site\frontend\app.js](d:\site\frontend\app.js#L59-L130)

**Problem:**
DOMContentLoaded handler has async operations that can fail silently:

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  const needsListings = /* ... */;
  if (needsListings) await fetchAllListingsFromDB();  // ⚠️ Can throw unhandled
  initAuth();  // ⚠️ What if this fails?
  updateCartBadge();  // ⚠️ Unguarded array access
  // ... etc
});
```

If `fetchAllListingsFromDB()` throws, entire init chain breaks.

**Fix:**
```javascript
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Phase 1: Load critical data
    const needsListings = document.getElementById('listingsGrid') ||
      document.getElementById('homeCarousel') ||
      document.getElementById('listingDetail') ||
      document.getElementById('savedGrid') ||
      document.getElementById('compareTable') ||
      document.getElementById('myListingsGrid');

    if (needsListings) {
      try {
        await fetchAllListingsFromDB();
      } catch (err) {
        logErr('Failed to load listings, continuing with empty state:', err);
        GLOBAL_LISTINGS = [];  // Continue with empty state
      }
    }
    
    // Phase 2: Init auth/UI (with error handling)
    try {
      initAuth();
    } catch (err) {
      logErr('Auth init failed:', err);
    }
    
    try {
      updateCartBadge();
    } catch (err) {
      logErr('Cart badge update failed:', err);
    }
    
    try {
      renderCompareTray();
    } catch (err) {
      logErr('Compare tray render failed:', err);
    }
    
    // Phase 3: Page-specific init
    const heroSection = document.getElementById('heroSection');
    if (heroSection) {
      try {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
          log('🍼 Page already loaded, initializing video effect...');
          setTimeout(() => {
            if (typeof initVideoScrollEffects === 'function') {
              initVideoScrollEffects();
            }
          }, 100);
        } else {
          window.addEventListener('load', () => {
            log('🍼 Window load event fired, initializing video effect...');
            setTimeout(() => {
              if (typeof initVideoScrollEffects === 'function') {
                initVideoScrollEffects();
              }
            }, 300);
          }, { once: true });
        }
      } catch (err) {
        logErr('Video scroll effect failed:', err);
      }
    }
    
    // Phase 4: Render home carousel
    try {
      if (document.getElementById('listingsGrid')) {
        renderListingsGrid('listingsGrid', getAllListings().slice(0, 6));
        updateStatCount();
      }

      const carousel = document.getElementById('homeCarousel');
      if (carousel) {
        const newestListings = getAllListings().slice(0, 5);
        if (newestListings && newestListings.length > 0) {
          carousel.innerHTML = newestListings.map(renderListingCard).join('');
        } else {
          carousel.innerHTML = '<div class="status-message">No new listings at the moment.</div>';
        }
      }
    } catch (err) {
      logErr('Failed to render listings:', err);
    }
  } catch (err) {
    logErr('Critical initialization error:', err);
    // Show fallback UI
    document.body.innerHTML = '<div style="padding:40px; text-align:center; color:#fff;"><h2>⚠️ Server Connection Error</h2><p>Please refresh the page.</p></div>';
  }
});

// Add global error handlers as safety net:
window.addEventListener('error', (event) => {
  logErr('Uncaught error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  logErr('Unhandled promise rejection:', event.reason);
  // Optionally show user notification
  showToast('An unexpected error occurred. Please refresh.', 'error');
});
```

**Deadline:** BEFORE LAUNCH

---

### [HIGH-6] Form Submission Without Proper Validation Feedback
**Severity:** 🟠 HIGH  
**Type:** UX/Data Integrity Issue  
**Files:** [d:\site\frontend\create-listing.html](d:\site\frontend\create-listing.html) & others

**Problem:**
Multiple forms lack client-side validation error feedback:
- Create listing form accepts invalid data and sends to backend
- Profile form doesn't show validation errors
- No loading states during form submission
- No success confirmation messages

**Fix:** Add validation feedback layer before using `authFetch()`:

```javascript
// In app.js or create-listing.html, wrap form submissions:

async function submitCreateListing(formData) {
  try {
    // Validate form fields with detailed feedback
    const errors = [];
    
    if (!formData.title || formData.title.trim().length === 0) {
      errors.push('Title is required');
    } else if (formData.title.length > 200) {
      errors.push('Title must be 200 characters or less');
    }
    
    if (!formData.price || isNaN(formData.price)) {
      errors.push('Price must be a valid number');
    } else if (formData.price < 1 || formData.price > 10000000) {
      errors.push('Price must be between ₹1 and ₹10,000,000');
    }
    
    if (!formData.region) {
      errors.push('Region is required');
    } else if (!['AP', 'NA', 'EU', 'KR', 'LATAM', 'BR'].includes(formData.region)) {
      errors.push('Invalid region selected');
    }
    
    // Show errors before submitting
    if (errors.length > 0) {
      showToast(errors[0], 'error');  // Show first error
      return false;
    }
    
    // Show loading state
    const submitBtn = document.querySelector('[data-action="submit-listing"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';
    
    // Submit form
    const response = await authFetch(`${API_BASE_URL}/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create listing');
    }
    
    // Success state
    showToast('Listing created successfully! 🎉', 'success');
    
    // Redirect after success
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 2000);
    
  } catch (err) {
    showToast(err.message, 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}
```

**Deadline:** BEFORE LAUNCH

---

### [HIGH-7] Backend Error Response Inconsistency
**Severity:** 🟠 HIGH  
**Type:** API Contract Issue  
**File:** [d:\site\backend\server.js](d:\site\backend\server.js)

**Problem:**
Error responses are not consistent:

```javascript
// Some routes return: { error: 'message' }
res.status(400).json({ error: 'Invalid email address' });

// Some return: { errors: [...] }
return res.status(400).json({ errors: errors.array() });

// Some return: { success: false }
res.status(500).json({ error: 'Server error' });

// Frontend expects various formats:
const data = await res.json();
showToast(data.error || data.errors?.[0]?.msg || 'Unknown error', 'error');
```

This makes error handling fragile on frontend.

**Fix:** Standardize all error responses in backend:

```javascript
// Create error handler middleware in backend/server.js (after line 210):

const errorHandler = (err, req, res, next) => {
  // Operational errors (expected)
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      details: err.details || null
    });
  }
  
  // Programming errors (unexpected)
  console.error('❌ Unexpected error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : null
  });
};

app.use(errorHandler);

// Wrap all routes with async error handler:
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Example: Update one route to use standardized format
app.post('/api/listings', requireAuth, [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('price').isInt({ min: 1, max: 10000000 }).withMessage('Invalid price'),
  // ...
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.param, message: e.msg }))
    });
  }
  
  try {
    // listing creation logic...
    res.status(201).json({
      success: true,
      data: { listingId, message: 'Listing created' }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to create listing'
    });
  }
}));

// Frontend standardized handler:
async function handleApiResponse(res) {
  const data = await res.json();
  
  if (!res.ok) {
    const errorMsg = data.error || 
                     data.details?.message ||
                     data.message ||
                     'An error occurred';
    throw new Error(errorMsg);
  }
  
  return data.data || data;
}
```

**Deadline:** BEFORE OR SHORTLY AFTER LAUNCH

---

### [HIGH-8] No Input Sanitization on Admin Panel Listings Display
**Severity:** 🟠 HIGH  
**Type:** XSS Vulnerability in Admin Interface  
**File:** [d:\site\frontend\admin.html](d:\site\frontend\admin.html#L240-L280)

**Problem:**
```html
<!-- Line 247 in admin.html -->
else pendingBody.innerHTML = pending.map(l => `
  <tr>
    <td>${l.title}</td>  <!-- ❌ Unsanitized user input -->
    <td>${l.sellerName}</td>  <!-- ❌ Unsanitized -->
    <td>₹${(l.price || 0).toLocaleString('en-IN')}</td>
    <td>${l.status}</td>
  </tr>
`).join('');
```

While `sanitize()` function exists in app.js, it's not imported in admin.html. User-generated content displayed without escaping.

**Fix:**
```html
<!-- In admin.html, ensure sanitize is available -->
<script src="app.js"></script>  <!-- Make sure app.js is loaded before admin logic -->

<!-- Then use sanitize in template: -->
else pendingBody.innerHTML = pending.map(l => `
  <tr>
    <td title="${sanitize(l.title)}">${sanitize(l.title?.substring(0, 50) || 'Untitled')}</td>
    <td>${sanitize(l.sellerName || 'Anonymous')}</td>
    <td>₹${(l.price || 0).toLocaleString('en-IN')}</td>
    <td><span class="badge badge-${l.status}">${sanitize(l.status)}</span></td>
  </tr>
`).join('');
```

**Deadline:** BEFORE LAUNCH

---

## MEDIUM-PRIORITY ISSUES (FIX SOON)

### [MEDIUM-1] Image Preload Cache May Not Persist Across App Reloads
**Severity:** 🟡 MEDIUM  
**Type:** Performance Optimization  
**File:** [d:\site\frontend\app.js](d:\site\frontend\app.js#L980-L1010)

**Problem:**
```javascript
// Current approach: Uses link rel="prefetch" which is non-blocking
// But doesn't guarantee images are cached before first render
<link rel="prefetch" href="frames/frame_0001.jpg">
<link rel="prefetch" href="frames/frame_0002.jpg">
// ... etc for 39 frames
```

On slow networks, images may not load before needed. Consider using Service Worker for reliable cache.

**Fix:**
Create a simple service worker for frame caching:

```javascript
// Create: frontend/sw.js
const CACHE_NAME = 'asta-mart-v1';
const FRAME_URLs = [];

for (let i = 1; i <= 39; i++) {
  FRAME_URLs.push(`/frames/frame_${String(i).padStart(4, '0')}.jpg`);
}

const urlsToCache = [
  '/',
  '/style.css',
  '/app.js',
  ...FRAME_URLs
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell and frames');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.log('[SW] Cache failed:', err))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
      .catch(() => new Response('Offline'))
  );
});

// In index.html, register service worker:
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[SW] Registered'))
      .catch(err => console.log('[SW] Registration failed:', err));
  }
</script>
```

**Deadline:** AFTER LAUNCH (nice-to-have)

---

### [MEDIUM-2] No Database Backup Strategy Documented
**Severity:** 🟡 MEDIUM  
**Type:** Disaster Recovery  
**File:** MongoDB configuration

**Problem:**
No documented backup procedure. If MongoDB instance fails, all user data and listings are lost.

**Fix:**
Add backup strategy document:

```bash
# Create: backend/BACKUP_PROCEDURE.md

## MongoDB Backup Strategy

### For Atlas (Cloud MongoDB):
1. Enable "Continuous Backup" in MongoDB Atlas console
2. Set backup retention to 30 days minimum
3. Test restore procedure monthly

### For Self-Hosted MongoDB:
1. Daily backups using mongodump:
```bash
#!/bin/bash
# Create: backend/backup.sh
BACKUP_DIR="/backups/mongo"
DATE=$(date +%Y-%m-%d_%H-%M-%S)

mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/$DATE"

# Keep only last 30 days
find $BACKUP_DIR -mtime +30 -exec rm -rf {} \;

echo "Backup created: $BACKUP_DIR/$DATE"
```

2. Schedule with cron:
```
0 2 * * * /home/ubuntu/asta-mart/backend/backup.sh
```

3. Monitor backup success
4. Test restores quarterly
```

**Deadline:** BEFORE LAUNCH (document at minimum)

---

### [MEDIUM-3] Missing Request Body Size Validation on Image Uploads
**Severity:** 🟡 MEDIUM  
**Type:** DoS Attack Vector  
**File:** [d:\site\backend\server.js](d:\site\backend\server.js#L32)

**Problem:**
Global 1MB JSON limit, but base64 images can approach this. Large images bypass size validation.

```javascript
// Current: app.use(express.json({ limit: '1mb' }));
// User uploads 5MB image as base64 → 1MB limit stops it, but edge case exists
```

**Fix:**
```javascript
// In backend/server.js, create image-specific limiter:
const multer = require('multer');  // npm install multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024  // 2MB max per image
  },
  fileFilter: (req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, and WebP images allowed'));
    }
    cb(null, true);
  }
});

// Also add validation in listings POST route:
body('images')
  .optional()
  .isArray({ max: 10 }).withMessage('Maximum 10 images allowed')
  .custom(arr => {
    return arr.every(url => {
      // Check URL length (proxy for image size)
      if (url.length > 500 * 1024) {  // 500KB URL (roughly 375KB image)
        throw new Error('Image too large (max 500KB)');
      }
      return url.startsWith('https://') && url.length < 500 * 1024;
    });
  }).withMessage('All images must be valid HTTPS URLs under 500 characters'),
```

**Deadline:** BEFORE LAUNCH (at least add validation)

---

### [MEDIUM-4] No Rate Limit Bypass Protection
**Severity:** 🟡 MEDIUM  
**Type:** Security Issue  
**File:** [d:\site\backend\server.js](d:\site\backend\server.js#L100-L150)

**Problem:**
Rate limiters use IP address, but can be bypassed if user behind proxy/VPN. Multiple IPs can hit endpoints faster than individual rate limit allows.

```javascript
// Current: Only checks request.ip
const viewLimiter = rateLimit({
  keyGenerator: (req) => req.ip + ':' + req.params.id,  // ❌ IP spoofing possible
  // ...
});
```

**Fix:**
```javascript
// Add X-Forwarded-For header trust in backend/server.js (before rate limiters):
app.set('trust proxy', 1);  // Trust first proxy (Cloudflare, Nginx, etc.)

// Or use user ID for authenticated endpoints:
const viewLimiter = rateLimit({
  keyGenerator: (req) => {
    // For auth endpoints, use user ID instead of IP
    if (req.user) return req.user.email;
    // For public endpoints, use IP (more forgiving) or combo
    return req.ip;
  },
  windowMs: 60 * 60 * 1000,
  max: 1,
  message: { error: 'Too many views from your account. Please wait.' },
  standardHeaders: false,
  legacyHeaders: false
});

// Also add per-user rate limiting for listing creation:
app.post('/api/listings', requireAuth, [
  // Add custom rate limit by user (max 5 listings per day)
  async (req, res, next) => {
    const listingCount = await Listing.countDocuments({
      sellerId: req.user.email,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    if (listingCount >= 5) {
      return res.status(429).json({
        error: 'You can create maximum 5 listings per day'
      });
    }
    next();
  },
  // ... rest of validation
], async (req, res) => {
  // ... handler
});
```

**Deadline:** BEFORE OR SHORTLY AFTER LAUNCH

---

### [MEDIUM-5] No Content Security Policy for Inline Styles
**Severity:** 🟡 MEDIUM  
**Type:** CSP Bypass Risk  
**File:** [d:\site\frontend\app.js](d:\site\frontend\app.js#L516-L720)

**Problem:**
Large amounts of inline `style=""` attributes in generated HTML:

```javascript
const html = `<div style="grid-column: 1/-1; text-align: center; padding: 100px;">...`;
// This works because CSP allows 'unsafe-inline' for styleSrc (line 41 in server.js)
```

Allows attacker to inject styles (not as harmful as scripts, but reduces security posture).

**Fix:**
Convert inline styles to CSS classes:

```css
/* In style.css, add: */
.detail-no-found {
  grid-column: 1/-1;
  text-align: center;
  padding: 100px;
}

.no-results {
  text-align: center;
  padding: 100px;
}

/* And in Helmet config, change styleSrc: */
styleSrc: ["'self'", "https://fonts.googleapis.com"],
// Remove 'unsafe-inline'
```

Then in app.js:
```javascript
const html = `<div class="detail-no-found"><h2>Account Not Found</h2>...</div>`;
```

**Deadline:** AFTER LAUNCH (refactoring)

---

### [MEDIUM-6] Admin Moderation Panel Shows All Listings Regardless of Status
**Severity:** 🟡 MEDIUM  
**Type:** UI/UX Issue  
**File:** [d:\site\frontend\admin.html](d:\site\frontend\admin.html#L200-L280)

**Problem:**
```javascript
// Admin panel doesn't filter by status, shows everything:
fetch(`${API_BASE_URL}/admin/listings`)
  .then(r => r.json())
  .then(data => {
    pending = data.listings.filter(l => l.status === 'pending');
    active = data.listings.filter(l => l.status === 'active');
    // ... etc
  });
```

With thousands of listings, filtering on frontend is slow. Should use backend pagination with status filter.

**Fix:**
Use backend pagination with status parameter:

```javascript
// In admin.html, update fetch:
async function loadAdminListings(status = 'pending') {
  try {
    const res = await authFetch(
      `${API_BASE_URL}/admin/listings?status=${status}&page=1&limit=50`
    );
    const data = await res.json();
    
    if (status === 'pending') {
      renderPendingListings(data.listings);
    } else if (status === 'active') {
      renderActiveListings(data.listings);
    }
    
    // Show pagination
    if (data.pages > 1) {
      renderPaginationControls(data.page, data.pages, status);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Call on page load:
document.addEventListener('DOMContentLoaded', () => {
  loadAdminListings('pending');  // Load pending first
});

// Add tabs to switch status:
document.querySelector('[data-status="pending"]').addEventListener('click', () => {
  loadAdminListings('pending');
});

document.querySelector('[data-status="active"]').addEventListener('click', () => {
  loadAdminListings('active');
});
```

**Deadline:** BEFORE LAUNCH (at least client-side filtering)

---

### [MEDIUM-7] Missing Google Analytics or Error Tracking
**Severity:** 🟡 MEDIUM  
**Type:** Observability  
**File:** Frontend HTML files

**Problem:**
No telemetry. You won't know:
- Which pages users visit
- Where they drop off
- JavaScript errors in production
- Performance metrics

**Fix:**
Add Sentry for error tracking:

```html
<!-- Add to all HTML files, in <head>: -->
<script src="https://browser.sentry-cdn.com/7.91.0/bundle.min.js" integrity="sha384-..." crossorigin="anonymous"></script>
<script>
  Sentry.init({
    dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',  // From Sentry dashboard
    environment: 'production',
    tracesSampleRate: 0.1,  // Sample 10% of errors for perf
    beforeSend(event, hint) {
      // Don't send errors from browser extensions
      if (event.exception) {
        const error = hint.originalException;
        if (error && error.message?.includes('chrome-extension')) {
          return null;
        }
      }
      return event;
    }
  });
</script>
```

**Deadline:** AFTER LAUNCH (not critical for initial launch)

---

## LOW-PRIORITY ISSUES (NICE-TO-HAVE)

### [LOW-1] Missing favicon.ico Fallback
**Severity:** 🔵 LOW  
**Type:** Browser Error Logs  

Every browser request includes `GET /favicon.ico` attempt. Add fallback:

```bash
# Copy favicon to root:
cp frontend/favicon-64x64.png frontend/favicon.ico
```

Or add route:
```javascript
// In backend/server.js:
app.get('/favicon.ico', (req, res) => {
  res.type('image/x-icon');
  res.sendFile(path.join(__dirname, '../frontend/favicon-64x64.png'));
});
```

---

### [LOW-2] Missing Robots Meta Tags on Auth-Gated Pages
**Severity:** 🔵 LOW  
**Type:** SEO  
**Files:** profile.html, saved.html, dashboard.html

Add to prevent indexing of private pages:

```html
<meta name="robots" content="noindex, nofollow">
```

---

### [LOW-3] No Structured Data (JSON-LD) for Product Pages
**Severity:** 🔵 LOW  
**Type:** SEO/Rich Snippets  

Add structured data to listing.html for Google Rich Results:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Valorant Account - Iron 3 Rank",
  "description": "100+ Premium Skins, Full Email Access",
  "offers": {
    "@type": "Offer",
    "price": "5999",
    "priceCurrency": "INR",
    "availability": "https://schema.org/InStock"
  }
}
</script>
```

---

### [LOW-4] Missing Subresource Integrity for CDN Scripts Without Hash
**Severity:** 🔵 LOW  
**Type:** Security Best Practice  

Some script tags missing SRI hashes:

```html
<!-- Before (no integrity): -->
<script src="https://unpkg.com/some-lib.js"></script>

<!-- After (with hash): -->
<script src="https://unpkg.com/some-lib.js" integrity="sha384-..." crossorigin="anonymous"></script>
```

Generate hashes for any missing ones.

---

### [LOW-5] No Loading Skeletons for Mobile Users
**Severity:** 🔵 LOW  
**Type:** UX  

Add skeleton screens instead of blank loading state:

```html
<div class="skeleton-card">
  <div class="skeleton-img"></div>
  <div class="skeleton-text"></div>
</div>

<style>
  .skeleton-card {
    animation: pulse 2s infinite;
  }
  
  @keyframes pulse {
    0% { opacity: 0.6; }
    50% { opacity: 1; }
    100% { opacity: 0.6; }
  }
</style>
```

---

### [LOW-6] Missing Dark Mode Alternative Color Contrast Check
**Severity:** 🔵 LOW  
**Type:** Accessibility  

Run WCAG contrast checker on all text/background combinations. Current design appears to meet 4.5:1 but verify.

---

## INFORMATION ITEMS

### [INFO-1] Environment Variable Documentation
Ensure `.env.example` is populated and committed. ✅ Already done.

### [INFO-2] API Rate Limit Documentation
Consider serving rate limit info in response headers (already included via express-rate-limit).

### [INFO-3] Database Backup Frequency
Test restore procedure monthly.

---

## PRE-LAUNCH CHECKLIST

Use this final checklist before deploying to production:

### CRITICAL (Must Complete)
- [ ] **[CRITICAL-1]** Remove hardcoded UPI ID - replace with user profile/API
- [ ] **[CRITICAL-2]** Add X-Frame-Options: DENY header via Helmet
- [ ] **[CRITICAL-3]** Implement HTTPS redirect middleware + HSTS header
- [ ] Test HTTPS enforcement: `http://api.asta-mart.in` → redirects to `https://`
- [ ] Verify cookies set correctly in production (secure: true)
- [ ] Set all environment variables (MONGODB_URI, JWT_SECRET, ADMIN_SECRET, NODE_ENV=production)

### HIGH (Should Complete)
- [ ] **[HIGH-1]** Add CSRF token validation to all state-changing routes
- [ ] **[HIGH-2]** Enable frontend asset caching (switch from `http-server` or configure headers)
- [ ] **[HIGH-3]** Add error handling to generateSkinsGrid() and generateAgentsGrid()
- [ ] **[HIGH-4]** Add optional chaining (?.) to all array/object accesses
- [ ] **[HIGH-5]** Wrap DOMContentLoaded handler in try-catch with error boundaries
- [ ] **[HIGH-6]** Add form validation feedback (errors shown before API call)
- [ ] **[HIGH-7]** Standardize all API error responses to consistent format
- [ ] **[HIGH-8]** Sanitize admin panel listing display (use sanitize() function)

### MEDIUM (Before or Shortly After)
- [ ] **[MEDIUM-1]** Consider Service Worker for frame preloading
- [ ] **[MEDIUM-2]** Document MongoDB backup procedure
- [ ] **[MEDIUM-3]** Add image size validation to file upload
- [ ] **[MEDIUM-4]** Test rate limiting with VPN (ensure can't bypass)
- [ ] **[MEDIUM-5]** Remove inline styles, move to CSS classes
- [ ] **[MEDIUM-6]** Add backend pagination filtering to admin listings
- [ ] **[MEDIUM-7]** Set up Sentry or similar error tracking

### Testing Checklist
- [ ] Test login/logout flow (multiple tabs)
- [ ] Test admin login (rate limiting after 5 attempts)
- [ ] Test OTP expiry (wait > 5 minutes, verify rejected)
- [ ] Test HTTPS redirect (call http://, verify 301 redirect)
- [ ] Test CSRF token validation (submit form from different origin, verify rejected)
- [ ] Test create listing with invalid fields (verify validation errors shown)
- [ ] Test listing reveal contact (verify seller info shown to auth users only)
- [ ] Test pagination (request page 1, 2, 3 - verify correct results)
- [ ] Test rate limiting (send 200+ requests in 15min, verify 429 response)
- [ ] Test null API responses (manually return empty arrays, verify no crashes)
- [ ] Test mobile (320px, 375px, 768px viewports)
- [ ] Test with slow network (Chrome DevTools throttle)
- [ ] Test with JavaScript disabled (verify graceful degradation for static pages)

### Deployment Checklist
- [ ] Backup production database BEFORE deployment
- [ ] Set NODE_ENV=production
- [ ] Set secure environment variables (use AWS Secrets Manager or similar, not in .env)
- [ ] Enable MongoDB backups (Atlas clusters: enable 30d backup)
- [ ] Set up log aggregation (CloudWatch, Datadog, Loggly)
- [ ] Set up monitoring/alerts (CPU, memory, error rates)
- [ ] Configure domain DNS correctly (api.asta-mart.in → backend)
- [ ] Configure TLS/SSL certificate (Let's Encrypt for free options)
- [ ] Run `npm audit` and fix vulnerabilities
- [ ] Test backend is reachable: `curl https://api.asta-mart.in/api/listings`
- [ ] Test frontend loads: browse to https://asta-mart.in
- [ ] Run smoke tests (create account, create listing, reveal contact)

### Final Sign-Off
- [ ] Security team: Approved ✓
- [ ] QA team: Approved ✓
- [ ] Product team: Approved ✓
- [ ] Ops team: Deployment ready ✓

---

## SUMMARY OF REMAINING WORK

**Before Launch:**
- Fix 3 critical security issues (UPI, HTTPS, headers)
- Fix 8 high-priority issues (CSRF, caching, validation, errors)
- Run full QA test cycle
- Load testing (ensure handles 100+ concurrent users)

**Estimated Time:** 8-12 hours for critical/high items

**Timeline:**
- ✅ Completed: 43 issues from previous audit sessions
- 📍 In-Progress: 27 issues from this audit
- ⏳ Remaining: Critical (3), High (8), Medium (7), Low (6), Info (3)

**Go-Live Decision:** ❌ **Do not launch until all CRITICAL items are resolved.** HIGH items should be fixed, or at minimum mitigated with deployment safeguards.

---

**End of Audit Report**

*Report Generated: April 9, 2026*  
*Auditor: Full-Stack Security & Code Quality Specialist*
