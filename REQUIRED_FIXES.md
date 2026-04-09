# ASTA MART - REQUIRED FIXES & CODE CHANGES
**Priority:** Critical and High issues only  
**Time Estimate:** 2-3 hours to complete all fixes  
**Testing Time:** 1 hour

---

## CRITICAL FIXES

### FIX-1: Remove and Rotate Exposed Secrets
**Priority:** 🔴 **CRITICAL - Do immediately**  
**Files to Update:**
- `backend/.env`
- `backend/.gitignore` (verify .env is excluded)
- Gmail account (security settings)
- Environment variables in production

#### Step 1: Generate New Secrets
```bash
# Open terminal in project root and run:
node -e "console.log('New JWT_SECRET: ' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('New ADMIN_SECRET: ' + require('crypto').randomBytes(32).toString('hex'))"

# Save the output - you'll need these in next step
# Example output:
# New JWT_SECRET: abc123def456abc123def456abc123def456abc123def456abc123def456abc1
# New ADMIN_SECRET: xyz789uvw012xyz789uvw012xyz789uvw012xyz789uvw012xyz789uvw012xyz7
```

#### Step 2: Update .env File
**File:** `backend/.env`

Replace lines 7, 13-14 with new values:

```env
# BEFORE:
JWT_SECRET=fbd5f65432bf200adcb506bbc48004c4945cc00f17506af63815a0c64becc295390c932851a2ecac2f478a0e226e68c2
ADMIN_SECRET=31659e2e5d8b2c71d42381a8f7da9107d281fc293b8da9ab97fde5a54bf45923c79d4ba3dc365402b3052f15d82970dd

# AFTER: (Use values generated above)
JWT_SECRET=<output from first command>
ADMIN_SECRET=<output from second command>
```

For Gmail, also update:
```env
# Line 21-22 - Change ONLY in production deployment
# DO NOT manually change local .env if testing locally
# Instead, set via environment variables or secrets manager
EMAIL_USER=your-production-gmail@gmail.com
EMAIL_PASS=your-new-app-password
```

#### Step 3: Ensure .env is Not Tracked in Git
**File:** `backend/.gitignore`

```bash
# In terminal, run:
cd backend
git rm --cached .env  # Remove if already tracked (shows error if not tracked, OK)
git check-ignore -v .env  # Verify it will be ignored

# If not already in .gitignore, add it:
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.*.local" >> .gitignore
```

#### Step 4: Verify No Secrets in Git History
```bash
# In terminal, check if .env was ever committed:
git log --all --full-history -- backend/.env

# If it shows commits, you need to remove it from history:
# (Only do if repo is private and you haven't pushed to public GitHub)
git filter-branch --tree-filter 'rm -f backend/.env' --prune-empty HEAD
```

#### Step 5: Rotate Gmail Password
**DO THIS IMMEDIATELY:**

1. Go to: https://myaccount.google.com/apppasswords
2. Find and delete the app password: `hqqa pphs ieqw lvic`
3. Generate new app password for "Asta Mart Backend"
4. Copy the new password (16 characters, spaces removed)
5. Update EMAIL_PASS in your backend/.env or production secrets

✅ **Verification:**
- [ ] New JWT_SECRET generated and saved
- [ ] New ADMIN_SECRET generated and saved
- [ ] .env updated with new secrets
- [ ] .env added to .gitignore
- [ ] Gmail password rotated
- [ ] Old password removed from all files

---

## HIGH-PRIORITY FIXES

### FIX-2: Add Missing CSRF Protection
**Priority:** 🟠 **HIGH - Do before launch**  
**Files to Update:** `backend/server.js`

#### Change 1: Add CSRF to /api/auth/verify-otp
**File:** `backend/server.js` line 365

```javascript
// BEFORE (line 365):
app.post('/api/auth/verify-otp', verifyLimiter, async (req, res) => {

// AFTER:
app.post('/api/auth/verify-otp', verifyLimiter, csrfProtection, async (req, res) => {
```

#### Change 2: Add CSRF to /api/riot/sync-url
**File:** `backend/server.js` line 621

```javascript
// BEFORE (line 621):
app.post('/api/riot/sync-url', syncLimiter, async (req, res) => {

// AFTER:
app.post('/api/riot/sync-url', syncLimiter, csrfProtection, async (req, res) => {
```

✅ **Verification:**
```bash
# Run grep to verify CSRF is on all POST/PUT/DELETE routes:
grep -n "app.post\|app.put\|app.patch\|app.delete" backend/server.js | grep -v csrfProtection
# Should return almost nothing (only GET routes and specific ones like rate-limit-only endpoints)
```

---

### FIX-3: Add Frontend CSRF Token Inclusion
**Priority:** 🟠 **HIGH - Do before launch**  
**Files to Update:** `frontend/app.js`

#### Change 1: Create CSRF Token Fetcher
**File:** `frontend/app.js` - Add after line 20

```javascript
// ADD AFTER line 20 (after API_BASE_URL definition):

// ===================== CSRF TOKEN MANAGEMENT =====================
let CSRF_TOKEN = null;

async function fetchCSRFToken() {
  try {
    const res = await fetch(`${API_BASE_URL}/csrf-token`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error('Failed to fetch CSRF token');
    
    const data = await res.json();
    CSRF_TOKEN = data.csrfToken;
    sessionStorage.setItem('csrf_token', CSRF_TOKEN);
    
    if (isDev) log('✅ CSRF token obtained');
  } catch (err) {
    logErr('CSRF token fetch failed:', err);
    // Continue anyway - some routes don't need CSRF
  }
}
```

#### Change 2: Update authFetch Function
**File:** `frontend/app.js` - Find and replace sendAuth function

```javascript
// FIND THIS (around line 1050):
async function authFetch(url, options = {}) {
  const user = JSON.parse(localStorage.getItem('am_user') || 'null');
  const token = document.cookie.split('; ').find(row => row.startsWith('am_token='))?.split('=')[1];
  
  let res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers
    },
    credentials: 'include'
  });

// REPLACE WITH:
async function authFetch(url, options = {}) {
  // Get CSRF token from session storage or global variable
  const csrfToken = CSRF_TOKEN || sessionStorage.getItem('csrf_token') || '';
  
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'CSRF-Token': csrfToken,  // ✅ Add CSRF token to all requests
      ...options.headers
    },
    credentials: 'include'
  });

  if (res.status === 401) {
    warn('⚠️ Session expired (401 Unauthorized), redirecting to login');
    localStorage.removeItem('am_user');
    openAuth('login');
    throw new Error('Session expired. Please log in again.');
  }
  
  return res;
}
```

#### Change 3: Ensure CSRF Token Fetched on Page Load
**File:** `frontend/app.js` - Verify line 72 calls fetchCSRFToken()

```javascript
// FIND (around line 72 in DOMContentLoaded listener):
try {
  // Fetch CSRF token for state-changing requests
  await fetchCSRFToken();

// REPLACE WITH (if it doesn't match exactly):
try {
  // Fetch CSRF token for state-changing requests
  const csrfTokenRes = await fetch(`${API_BASE_URL}/csrf-token`, {
    credentials: 'include'
  });
  if (csrfTokenRes.ok) {
    const csrfData = await csrfTokenRes.json();
    CSRF_TOKEN = csrfData.csrfToken;
    sessionStorage.setItem('csrf_token', CSRF_TOKEN);
    log('✅ CSRF token fetched');
  }
} catch (err) {
  logErr('CSRF token fetch failed:', err);
}
```

✅ **Verification:**
```bash
# Test CSRF protection is working:
curl -X POST https://api.asta-mart.in/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otp":"123456"}' \
  -v

# Should return: 403 Forbidden (missing CSRF token)
# OR should work if you include: -H "CSRF-Token: <value>"
```

---

### FIX-4: Guard Console.log Behind Development Check
**Priority:** 🟠 **HIGH - Do before launch**  
**Files to Update:** `backend/server.js`, `backend/riotAuth.js`, `backend/jobs/valorantSync.js`

#### Change 1: Guard CORS Log
**File:** `backend/server.js` line 96

```javascript
// BEFORE:
console.log('✅ CORS Origins:', corsOrigins);

// AFTER:
if (process.env.NODE_ENV !== 'production') {
  console.log('✅ CORS Origins:', corsOrigins);
}
```

#### Change 2: Guard Email Config Log
**File:** `backend/server.js` line 168

```javascript
// BEFORE:
console.log('✅ [EMAIL] Email service configured and ready');

// AFTER:
if (process.env.NODE_ENV !== 'production') {
  console.log('✅ [EMAIL] Email service configured and ready');
} else {
  console.info('[EMAIL] Service ready');
}
```

#### Change 3: Guard MongoDB Connection Log
**File:** `backend/server.js` after line 215

```javascript
// FIND:
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// REPLACE WITH:
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ Connected to MongoDB');
    }
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);  // Fail fast if can't connect
  });
```

#### Change 4: Guard Riot Sync Logs
**File:** `backend/riotAuth.js` line 63

```javascript
// BEFORE:
console.log(`\n--- STARTING DYNAMIC RIOT SYNC ---`);

// AFTER:
if (process.env.NODE_ENV !== 'production') {
  console.log(`\n--- STARTING DYNAMIC RIOT SYNC ---`);
}
```

And similar fixes for lines 135, 175, 227, 253 in riotAuth.js

#### Change 5: Guard Sync Job Logs
**File:** `backend/jobs/valorantSync.js` lines 18, 44, 47

```javascript
// BEFORE (line 18):
console.log('🔄 Starting daily Valorant API sync...');

// AFTER:
if (process.env.NODE_ENV !== 'production') {
  console.log('🔄 Starting daily Valorant API sync...');
}

// BEFORE (line 44):
console.log(`✅ Successfully synced ${formattedSkins.length} skins.`);

// AFTER:
if (process.env.NODE_ENV !== 'production') {
  console.log(`✅ Successfully synced ${formattedSkins.length} skins.`);
}

// BEFORE (line 47):
console.error('❌ Failed to sync Valorant data:', error.message);

// AFTER (error logs should always show):
console.error('❌ Failed to sync Valorant data:', error.message);
```

✅ **Verification:**
```bash
# Ensure NODE_ENV is set in production:
NODE_ENV=production node backend/server.js
# Should NOT show development logs
```

---

### FIX-5: Validate Secret Key Strength
**Priority:** 🟠 **HIGH - Do before launch**  
**Files to Update:** `backend/server.js`

#### Change: Add Secret Validation
**File:** `backend/server.js` lines 4-10

```javascript
// BEFORE:
const REQUIRED_ENV_VARS = ['MONGODB_URI', 'JWT_SECRET', 'ADMIN_SECRET'];
REQUIRED_ENV_VARS.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

// AFTER:
const REQUIRED_ENV_VARS = ['MONGODB_URI', 'JWT_SECRET', 'ADMIN_SECRET'];
REQUIRED_ENV_VARS.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
  
  // Validate secret strength for sensitive keys
  if ((key === 'JWT_SECRET' || key === 'ADMIN_SECRET')) {
    if (process.env[key].length < 32) {
      console.error(`❌ FATAL: ${key} must be at least 32 characters`);
      console.error(`   Received: ${process.env[key].length} characters`);
      console.error(`   Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
      process.exit(1);
    }
  }
});
```

✅ **Verification:**
```bash
# Test with weak secret:
JWT_SECRET=short ADMIN_SECRET=short node backend/server.js
# Should fail with error message about minimum length

# Test with proper secrets:
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
ADMIN_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
node backend/server.js
# Should start successfully
```

---

## SUMMARY OF CHANGES

### Files Modified: 5
1. **backend/.env** - Update secrets
2. **backend/.gitignore** - Ensure .env is excluded
3. **backend/server.js** - 5 changes (CSRF on 2 routes, console guards, secret validation)
4. **frontend/app.js** - 3 changes (CSRF token fetcher, authFetch update, verification)
5. **backend/riotAuth.js** - 5 changes (console guards)
6. **backend/jobs/valorantSync.js** - 3 changes (console guards)

### Total Estimated Time: 45 minutes
- 15 minutes: Rotate secrets, update .env, fix git
- 15 minutes: Add CSRF protection backend
- 10 minutes: Add CSRF tokens frontend
- 5 minutes: Guard console.log statements
- 1 minute: Add secret validation

### Testing Checklist After Changes
- [ ] Backend starts without errors: `npm start`
- [ ] Backend shows NO development logs when NODE_ENV=production  
- [ ] CSRF token endpoint returns valid token: `curl https://api.asta-mart.in/api/csrf-token`
- [ ] Login flow works (sends OTP, verifies OTP with CSRF token)
- [ ] Create listing endpoint rejects requests without CSRF token (HTTP 403)
- [ ] Rate limiting still works (send 6+ OTPs in 1 min, expect 429)
- [ ] Admin login works with new ADMIN_SECRET
- [ ] No errors in browser console when creating normal requests

---

## DEPLOYMENT CHECKLIST

Before deploying to production:

- [ ] All 5 CRITICAL/HIGH fixes applied
- [ ] Run `npm audit` and address vulnerabilities
- [ ] Test full signup → create listing → reveal contact flow
- [ ] Test from mobile (375px viewport)
- [ ] Verify HTTPS redirect works: `curl -I http://api.asta-mart.in`
- [ ] Confirm MongoDB credentials work in production
- [ ] Verify Email service credentials updated
- [ ] Set NODE_ENV=production before deployment
- [ ] Backup production database BEFORE deploying
- [ ] Monitor error logs for first hour after deployment
- [ ] Keep old version ready to rollback if needed

**Deploy Command:**
```bash
# Build and start with production settings
NODE_ENV=production \
MONGODB_URI=$PRODUCTION_MONGODB_URI \
JWT_SECRET=$PRODUCTION_JWT_SECRET \
ADMIN_SECRET=$PRODUCTION_ADMIN_SECRET \
EMAIL_USER=$PRODUCTION_EMAIL \
EMAIL_PASS=$PRODUCTION_EMAIL_PASS \
npm start
```

---

**All fixes are backward compatible and can be applied incrementally.**

